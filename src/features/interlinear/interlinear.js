// Izvršna logika tekstualne analize, ePub parsiranja i komunikacije s Gemini API-jem

import { otvoriBazu, STORE_NAME, INTERLINEARNI_STORE, spremiUStorage } from '../../core/db.js';
import { dohvatiGeminiKluc } from '../../core/state.js';
import { dohvatiCijeliTekstIzGDoca } from '../google-drive/drive.api.js';
import { dohvatiGlosarIzIndexedDB, stvoriGlosar } from '../glossary/glossary.js';
import { navigirajNa } from '../../core/router.js';
import { dohvatiCijeliTekstIzPdfa, jePdfDatoteka } from '../pdf-parser/pdf.parser.js';
import { dohvatiDokumenteSpinea } from '../epub-parser/epub.parser.js';
import { parsirajLlmJson, porukaGreske } from '../../utils/llmJson.js';

const GEMINI_MIN_REQUEST_INTERVAL_MS = 5000;
const GEMINI_MAX_RATE_LIMIT_RETRIES = 5;
let zadnjiGeminiPoziv = 0;

function pricekaj(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pricekajGeminiInterval() {
  const preostalo = GEMINI_MIN_REQUEST_INTERVAL_MS - (Date.now() - zadnjiGeminiPoziv);
  if (preostalo > 0) await pricekaj(preostalo);
  zadnjiGeminiPoziv = Date.now();
}

function dohvatiRetryAfterMs(response) {
  const vrijednost = response.headers.get('Retry-After');
  if (!vrijednost) return 0;
  const sekunde = Number(vrijednost);
  if (Number.isFinite(sekunde)) return Math.max(0, sekunde * 1000);
  const datum = Date.parse(vrijednost);
  return Number.isFinite(datum) ? Math.max(0, datum - Date.now()) : 0;
}

function skratiZaPrompt(tekst, maxZnakova = 2000) {
  if (!tekst) return "";
  return tekst.length > maxZnakova ? tekst.substring(0, maxZnakova) + "..." : tekst;
}

export function ocistiISpodijeliOdlomke(tekst) {
  if (!tekst) return [];
  return tekst
    .split(/\n\s*\n/)
    .map(o => o.trim())
    .filter(o => o.length > 0);
}

export function pripremiTekstZaPoravnanje(rawTekst) {
  if (!rawTekst) return [];

  return rawTekst
    .replace(/<[^>]*>/g, '')
    .replace(/\u00A0/g, ' ')
    // Google Docs/HTML text can expose vertical-tab and form-feed paragraph
    // separators instead of ordinary newline characters.
    .replace(/[\v\f\u2028\u2029]/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t+/g, ' ')
    .split('\n')
    .map(linija => linija.trim())
    .filter(linija => linija.length > 0);
}

function procijeniOmjerPrijevoda(izvor, prijevod) {
  const ukupnoIzvora = izvor.reduce((zbroj, odlomak) => zbroj + odlomak.length, 0);
  const ukupnoPrijevoda = prijevod.reduce((zbroj, odlomak) => zbroj + odlomak.length, 0);
  return ukupnoIzvora > 0 ? ukupnoPrijevoda / ukupnoIzvora : 1;
}

function trosakDuljine(izvor, prijevod, omjer) {
  if (!izvor || !prijevod) return 4;
  const ocekivaniOmjer = prijevod.length / izvor.length;
  return Math.abs(Math.log((ocekivaniOmjer + 0.001) / (omjer + 0.001)));
}

function jeVjerojatnoUvodniOdlomak(odlomak) {
  const tekst = odlomak.toLowerCase();
  const rijeci = tekst.match(/\p{L}+/gu) || [];
  const recenice = odlomak.match(/[.!?]+(?=\s|$)/g)?.length || 0;
  const brojke = odlomak.match(/\d/g)?.length || 0;
  const bibliografskiSignal = /copyright|all rights reserved|isbn|library of congress|cataloging|original publication|published by|electricstory|©|®/i.test(odlomak);
  const strukturniSignal = odlomak.length < 120 && (
    brojke > 0 ||
    recenice === 0 ||
    rijeci.length <= 8 ||
    /^[^.!?]{1,120}$/.test(odlomak)
  );
  return bibliografskiSignal || strukturniSignal;
}

function jePrviProzniOdlomak(odlomak) {
  if (jeVjerojatnoUvodniOdlomak(odlomak) || odlomak.length < 180) return false;
  return /[.!?]["'”’)]?\s+[A-ZČĆĐŠŽ]/.test(odlomak) || odlomak.length >= 350;
}

function pronadiPrviNarativniOdlomak(odlomci) {
  return odlomci.findIndex((odlomak, index) =>
    index < 40 &&
    !jeVjerojatnoUvodniOdlomak(odlomak) &&
    jePrviProzniOdlomak(odlomak)
  );
}

function jeNaslovPoglavlja(odlomak) {
  return /^(?:#{1,6}\s*)?(?:chapter|first chapter|prologue|part|poglavlje|prvo poglavlje|proslov|dio)\b/i.test(
    odlomak.trim()
  );
}

function razdvojiNaslovOdProze(odlomak) {
  if (!jeNaslovPoglavlja(odlomak)) return [odlomak];

  // EPUB/Google Docs can place a chapter heading and its first prose sentence
  // in the same paragraph. A quote after the heading is a reliable boundary
  // for the common literary format without splitting ordinary quoted prose.
  const granicaCitata = odlomak.search(/\s+[“"'„«]/);
  if (granicaCitata > 0) {
    const naslov = odlomak.slice(0, granicaCitata).trim();
    const proza = odlomak.slice(granicaCitata).trim();
    if (naslov.length >= 8 && proza.length >= 20) return [naslov, proza];
  }
  return [odlomak];
}

function jeVjerojatnoStih(odlomak, susjedniOdlomci = []) {
  const tekst = odlomak.trim();
  if (!tekst || jeNaslovPoglavlja(tekst)) return false;
  const rijeci = tekst.match(/\p{L}+/gu) || [];
  const zavrsavaRecenicom = /[.!?…]["'”’)\]]?\s*$/.test(tekst);
  const kratkiSusjedi = susjedniOdlomci.filter(susjedni =>
    susjedni && susjedni.length <= 120
  ).length;
  return tekst.length <= 120 && (
    !zavrsavaRecenicom ||
    (rijeci.length <= 14 && kratkiSusjedi >= 2)
  );
}

function vrstaSadrzaja(odlomci, index) {
  const odlomak = odlomci[index] || '';
  if (jeNaslovPoglavlja(odlomak)) return 'naslov';
  const susjedni = [odlomci[index - 1], odlomci[index + 1]].filter(Boolean);
  return jeVjerojatnoStih(odlomak, susjedni) ? 'stih' : 'proza';
}

function smijeSpojitiSadrzaj(izvorneVrste, prijevodneVrste) {
  const sveVrste = [...izvorneVrste, ...prijevodneVrste];
  // Never let paragraph-boundary recovery consume a chapter heading together
  // with a poem line or regular prose. This is what caused the poem/title
  // drift in the reported package.
  if (sveVrste.includes('naslov') && new Set(sveVrste).size > 1) return false;
  if (sveVrste.includes('stih') && sveVrste.includes('proza')) return false;
  return true;
}

function spojiBlokoveNaslovaPoglavlja(odlomci) {
  const rezultat = [];
  for (let i = 0; i < odlomci.length; i++) {
    const razdvojeni = razdvojiNaslovOdProze(odlomci[i]);
    if (razdvojeni.length > 1) {
      rezultat.push(razdvojeni[0], razdvojeni[1]);
      continue;
    }
    if (!jeNaslovPoglavlja(odlomci[i])) {
      rezultat.push(odlomci[i]);
      continue;
    }

    const naslov = [odlomci[i]];
    let j = i + 1;
    while (
      j < odlomci.length &&
      naslov.length < 4 &&
      odlomci[j].length < 140 &&
      !/[.!?…]["'”’)\]]?\s*$/.test(odlomci[j])
    ) {
      naslov.push(odlomci[j]);
      j++;
    }
    rezultat.push(naslov.join(' '));
    i = j - 1;
  }
  return rezultat;
}

function pronadiSidroNaracije(odlomci, jePrijevod) {
  const normalizirajNaslov = odlomak => odlomak
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  const uzorak = jePrijevod
    ? /(?:^|\s)(?:proslov|prvo\s+poglavlje|poglavlje\s+(?:prvo|jedan|1|i)|chapter\s+(?:one|1|i)|first\s+chapter|dio\s+prvi)(?:\s|:|$)/i
    : /(?:^|\s)(?:prologue|chapter\s+(?:one|1|i)|first\s+chapter|part\s+one)(?:\s|:|$)/i;
  const kandidati = odlomci
    .map((odlomak, index) => ({ odlomak, index }))
    .filter(({ odlomak }) => uzorak.test(normalizirajNaslov(odlomak)));
  const narativnoSidro = kandidati.find(({ index }) => {
    const sljedeci = odlomci
      .slice(index + 1, index + 5)
      .find(tekst => jePrviProzniOdlomak(tekst));
    return Boolean(sljedeci);
  });
  if (narativnoSidro) return narativnoSidro.index;
  if (kandidati.length > 0) return kandidati[0].index;
  return pronadiPrviNarativniOdlomak(odlomci);
}

function znacajniTokeni(tekst) {
  return new Set(
    tekst
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .match(/\p{Script=Latin}{5,}|\d{3,}/gu) || []
  );
}

function bodujZajednickeTokene(izvor, prijevod) {
  const izvorniTokeni = znacajniTokeni(izvor);
  const prijevodniTokeni = znacajniTokeni(prijevod);
  const zajednicki = [...izvorniTokeni].filter(token => prijevodniTokeni.has(token));
  const bodovi = zajednicki.reduce((ukupno, token) => ukupno + (/\d/.test(token) ? 3 : Math.min(3, token.length / 5)), 0);
  return { zajednicki, bodovi };
}

function pronadiSidroPremaZajednickimTokenima(izvor, prijevod) {
  const ciljniIndex = prijevod.findIndex((odlomak, index) =>
    index < 40 && jePrviProzniOdlomak(odlomak)
  );
  if (ciljniIndex < 0) return -1;

  const ciljniTokeni = znacajniTokeni(
    prijevod.slice(ciljniIndex, ciljniIndex + 2).join(' ')
  );
  if (ciljniTokeni.size === 0) return -1;

  let najboljiIndex = -1;
  let najboljiBodovi = 0;
  let najboljiTokeni = [];
  izvor.slice(0, 100).forEach((odlomak, index) => {
    if (jeVjerojatnoUvodniOdlomak(odlomak)) return;
    const rezultat = bodujZajednickeTokene(odlomak, prijevod.slice(ciljniIndex, ciljniIndex + 2).join(' '));
    const pozicijskiBonus = Math.max(0, 1 - index / 100);
    const bodovi = rezultat.bodovi + pozicijskiBonus;
    if (bodovi > najboljiBodovi) {
      najboljiBodovi = bodovi;
      najboljiIndex = index;
      najboljiTokeni = rezultat.zajednicki;
    }
  });
  return najboljiBodovi >= 3 ? { index: najboljiIndex, bodovi: najboljiBodovi, tokeni: najboljiTokeni } : null;
}

function ukloniPocetneMetapodatke(izvor, prijevod) {
  const sidroIzvora = pronadiSidroNaracije(izvor, false);
  const sidroPrijevoda = pronadiSidroNaracije(prijevod, true);
  const zajednickoSidro = pronadiSidroPremaZajednickimTokenima(izvor, prijevod);
  const prviIzvor = sidroIzvora >= 0 ? sidroIzvora : izvor.findIndex(jePrviProzniOdlomak);
  const prviPrijevod = sidroPrijevoda >= 0 ? sidroPrijevoda : prijevod.findIndex(jePrviProzniOdlomak);
  // Explicit chapter/prologue headings are stronger anchors than a single
  // shared proper name such as "Hugo" or a place name.
  const uskladeniIzvor = sidroIzvora >= 0
    ? sidroIzvora
    : (zajednickoSidro ? zajednickoSidro.index : prviIzvor);
  console.groupCollapsed('[Poravnanje sidro]');
  console.table([{
    izvorniIndeks: uskladeniIzvor,
    prijevodniIndeks: prviPrijevod,
    razlog: sidroIzvora >= 0 ? 'heading-or-narrative-anchor' : (zajednickoSidro ? 'shared-latin-tokens' : 'first-narrative-block'),
    zajednickiTokeni: zajednickoSidro?.tokeni?.join(', ') || '',
    bodovi: zajednickoSidro?.bodovi || 0,
    pouzdanost: sidroIzvora >= 0 ? 'visoka' : (zajednickoSidro ? 'srednja' : 'niska')
  }]);
  console.groupEnd();
  if (prviIzvor <= 0 && prviPrijevod <= 0) {
    return { izvor, prijevod, uvod: [] };
  }

  const uvod = [
    ...izvor.slice(0, Math.max(0, uskladeniIzvor)).map(odlomak => ({
      izvor: odlomak,
      prijevod: '',
      spojeniOdlomci: false,
      preskocenUvod: true
    })),
    ...prijevod.slice(0, Math.max(0, prviPrijevod)).map(odlomak => ({
      izvor: '',
      prijevod: odlomak,
      spojeniOdlomci: false,
      preskocenUvod: true
    }))
  ];

  return {
    izvor: uskladeniIzvor >= 0 ? izvor.slice(uskladeniIzvor) : izvor,
    prijevod: prviPrijevod >= 0 ? prijevod.slice(prviPrijevod) : prijevod,
    uvod
  };
}

/**
 * Poravnava odlomke uz dopuštenje da dva susjedna izvorna odlomka budu
 * prevedena u jednom odlomku. To se često događa kada se izgube prijelomi
 * odlomaka u Google Docsu ili pri kopiranju teksta.
 */
export function poravnajSpojeneOdlomke(izvor, prijevod) {
  if (izvor.length === 0 || prijevod.length === 0) {
    return izvor.map((odlomak, index) => ({
      izvor: odlomak,
      prijevod: prijevod[index] || '',
      spojeniOdlomci: false
    }));
  }

  const omjer = procijeniOmjerPrijevoda(izvor, prijevod);
  // Content types are invariant during dynamic programming. Compute them
  // once instead of rerunning Unicode regexes for every candidate transition.
  const izvorneVrste = izvor.map((_, index) => vrstaSadrzaja(izvor, index));
  const prijevodneVrste = prijevod.map((_, index) => vrstaSadrzaja(prijevod, index));
  const troskovi = Array.from({ length: izvor.length + 1 }, () =>
    Array(prijevod.length + 1).fill(Number.POSITIVE_INFINITY)
  );
  const potezi = Array.from({ length: izvor.length + 1 }, () =>
    Array(prijevod.length + 1).fill(null)
  );
  troskovi[0][0] = 0;

  for (let i = 0; i <= izvor.length; i++) {
    for (let j = 0; j <= prijevod.length; j++) {
      if (!Number.isFinite(troskovi[i][j])) continue;
      // Uvodni dijelovi poput impressuma ili predgovora često nisu prevedeni.
      // Preskačemo ih samo prije prvog uparenog prijevodnog odlomka kako se
      // ostatak knjige ne bi pomaknuo za cijelo poglavlje.
      if (j < 8 && i < izvor.length && i < 30 && jeVjerojatnoUvodniOdlomak(izvor[i])) {
        const preskociTrosak = troskovi[i][j] + 0.1;
        if (preskociTrosak < troskovi[i + 1][j]) {
          troskovi[i + 1][j] = preskociTrosak;
          potezi[i + 1][j] = { prethodni: [i, j], preskocenUvod: true };
        }
      }
      if (i < izvor.length && j < prijevod.length) {
        const normalniTrosak = troskovi[i][j] + trosakDuljine(izvor[i], prijevod[j], omjer);
        if (normalniTrosak < troskovi[i + 1][j + 1]) {
          troskovi[i + 1][j + 1] = normalniTrosak;
          potezi[i + 1][j + 1] = { prethodni: [i, j], spojeni: false };
        }
      }
      if (i + 1 < izvor.length && j < prijevod.length) {
        if (smijeSpojitiSadrzaj(
          [izvorneVrste[i], izvorneVrste[i + 1]],
          [prijevodneVrste[j]]
        )) {
          const spojeniTrosak = troskovi[i][j] + 0.35 +
            trosakDuljine(`${izvor[i]} ${izvor[i + 1]}`, prijevod[j], omjer);
          if (spojeniTrosak < troskovi[i + 2][j + 1]) {
            troskovi[i + 2][j + 1] = spojeniTrosak;
            potezi[i + 2][j + 1] = { prethodni: [i, j], spojeni: true };
          }
        }
      }
      if (i < izvor.length && j + 1 < prijevod.length) {
        if (smijeSpojitiSadrzaj(
          [izvorneVrste[i]],
          [prijevodneVrste[j], prijevodneVrste[j + 1]]
        )) {
          const razdvojeniTrosak = troskovi[i][j] + 0.35 +
            trosakDuljine(izvor[i], `${prijevod[j]} ${prijevod[j + 1]}`, omjer);
          if (razdvojeniTrosak < troskovi[i + 1][j + 2]) {
            troskovi[i + 1][j + 2] = razdvojeniTrosak;
            potezi[i + 1][j + 2] = { prethodni: [i, j], razdvojeni: true };
          }
        }
      }
    }
  }

  const stavke = [];
  let i = izvor.length;
  let j = prijevod.length;
  const preskoceniUvod = [];
  while (i > 0 && j > 0 && potezi[i][j]) {
    const potez = potezi[i][j];
    const [prethodniI, prethodniJ] = potez.prethodni;
    if (potez.preskocenUvod) {
      preskoceniUvod.unshift(izvor[i - 1]);
      i = prethodniI;
      j = prethodniJ;
      continue;
    }
    stavke.unshift({
      izvor: izvor.slice(prethodniI, i).join(' '),
      prijevod: prijevod.slice(prethodniJ, j).join(' '),
      spojeniOdlomci: Boolean(potez.spojeni || potez.razdvojeni)
    });
    i = prethodniI;
    j = prethodniJ;
  }
  while (i > 0 && j === 0 && potezi[i][j]?.preskocenUvod) {
    preskoceniUvod.unshift(izvor[i - 1]);
    const [prethodniI, prethodniJ] = potezi[i][j].prethodni;
    i = prethodniI;
    j = prethodniJ;
  }
  if (i > 0 || j > 0) {
    return izvor.map((odlomak, index) => ({
      izvor: odlomak,
      prijevod: prijevod[index] || '',
      spojeniOdlomci: false
    }));
  }
  if (preskoceniUvod.length > 0) {
    stavke.unshift(...preskoceniUvod.map(odlomak => ({
      izvor: odlomak,
      prijevod: '',
      spojeniOdlomci: false,
      preskocenUvod: true
    })));
  }
  return stavke;
}

export function stvoriNormaliziraneSegmente(rawIzvor, rawPrijevod) {
  let izvorLinije = spojiBlokoveNaslovaPoglavlja(pripremiTekstZaPoravnanje(rawIzvor));
  let prijevodLinije = spojiBlokoveNaslovaPoglavlja(pripremiTekstZaPoravnanje(rawPrijevod));

  if (izvorLinije.length > prijevodLinije.length && izvorLinije.length > 1) {
    const prvaIzvor = izvorLinije[0].toLowerCase();
    const drugaIzvor = izvorLinije[1].toLowerCase();
    const prvaPrijevod = prijevodLinije[0] ? prijevodLinije[0].toLowerCase() : '';

    if (prvaIzvor === drugaIzvor || prvaIzvor.includes(drugaIzvor) || drugaIzvor === prvaPrijevod) {
      console.log("Detektiran duplikat/naslovnica u ePub izvorniku — uklanjam uvodnu liniju.");
      izvorLinije.shift(); 
    }
  }

  const pocetak = ukloniPocetneMetapodatke(izvorLinije, prijevodLinije);
  return [
    ...pocetak.uvod,
    ...poravnajSpojeneOdlomke(pocetak.izvor, pocetak.prijevod)
  ];
}

export async function dohvatiCijeliTekstIzEpuba(file) {
  if (!file) return "";
  const zip = await JSZip.loadAsync(file);
  const parser = new DOMParser();
  let puniTekst = [];

  const spineDocuments = await dohvatiDokumenteSpinea(zip, parser);
  for (const filename of spineDocuments) {
    const html = await zip.file(filename).async("string");
    const doc = parser.parseFromString(html, "text/html");
    const text = doc.body ? doc.body.textContent : "";
    if (text.trim().length > 0) {
      puniTekst.push(text.trim());
    }
  }

  return puniTekst.join("\n\n");
}

export async function pozoviGeminiAPI(paketOdlomaka, glosar, apiKey, pokusaj = 1) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

  const systemInstructionText = `
Ti si stručnjak za književno prevođenje.
Dat ti je niz odlomaka u obliku JSON liste. Svaki element sadrži 'index', 'izvor' (izvorni tekst) i 'prijevod' (prevedeni tekst).

Tvoj je zadatak analizirati svaki odlomak i, ako u prijevodu postoje stilske pogreške, krivi prijevodi, nekonzistentnost s priloženim glosarom ili propusti u prijevodu idioma, napiši kratku napomenu/komentar na jeziku prijevoda.

Za svaki odlomak najprije procijeni je li 'prijevod' stvarni prijevod odgovarajućeg odlomka iz 'izvor'. Ako je tekst prijevoda iz drugog poglavlja, nepovezan tekst, sažetak umjesto prijevoda ili je očito potpuno pogrešan, postavi "ispravanPrijevod": false. U tom slučaju komentar kratko objasni problem. Ako su u jednom elementu spojena dva susjedna izvorna odlomka i njihov prijevod, to NIJE pogrešan prijevod: postavi "ispravanPrijevod": true i napomeni da su odlomci spojeni u prijevodu.

Ne označavaj odlomak kao neispravan samo zato što se naslov poglavlja, osobno ime ili geografska lokacija razlikuju zbog prijevoda. Primjerice, "Chapter One: Lolitabu National Park, Zarakal" i njegov prevedeni naslov predstavljaju isto poglavlje. Naslovi poglavlja sami po sebi nisu dovoljan dokaz nepodudaranja; procijeni i stvarni prozni sadržaj.

Ako cijeli paket doista pripada drugom poglavlju ili uopće nije odgovarajući prijevod, možeš vratiti JSON oblika {"greska":"..."} s jasnim opisom da se izvor i prijevod ne podudaraju. Nemoj koristiti "greska" samo zbog različitih naslova poglavlja, imena ili lokacija.

Ako element ima "preskoceniUvod": true, to znači da prije njega postoje uvodni odlomci izvornika (npr. impressum, zahvale ili predgovor) kojih nema u prijevodu. To nije pogreška prijevoda; analiziraj navedeni par normalno i u komentaru kratko navedi da je uvodni dio izvornika izostavljen.

U ostalim slučajevima vrati validan JSON objekt s ključem "analiza" koji sadrži niz objekata formata:
{
  "analiza": [
    {
      "index": broj_indeksa_odlomka,
      "komentar": "Kratka napomena...",
      "ispravanPrijevod": true,
      "spojeniOdlomci": false
    }
  ]
}

Nemoj koristiti newline znakove unutar JSON stringova (koristi <br> za prijelom u novi red, <p> za paragrafe i <b>, <i> za formatiranje teksta.).

GLOSAR DOKUMENTA:
${JSON.stringify(glosar, null, 2)}
`;

  const promptText = `Analiziraj sljedeći paket odlomaka:\n\n${JSON.stringify(paketOdlomaka, null, 2)}`;

  const payload = {
    systemInstruction: { parts: [{ text: systemInstructionText }] },
    contents: [{ role: "user", parts: [{ text: promptText }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          analiza: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                index: { type: "INTEGER" },
                komentar: { type: "STRING" },
                ispravanPrijevod: { type: "BOOLEAN" },
                spojeniOdlomci: { type: "BOOLEAN" }
              },
              required: ["index", "komentar", "ispravanPrijevod", "spojeniOdlomci"]
            }
          },
          greska: { type: "STRING" }
        },
        // Gemini može vratiti ili analizu ili fatalnu grešku za neusklađen paket.
        propertyOrdering: ["analiza", "greska"]
      }
    }
  };

  try {
    await pricekajGeminiInterval();
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (response.status === 429) {
      if (pokusaj > GEMINI_MAX_RATE_LIMIT_RETRIES) {
        throw new Error(`Gemini privremeno nije dostupan (HTTP ${response.status}) nakon više pokušaja.`);
      }
      const odgoda = Math.max(
        dohvatiRetryAfterMs(response),
        Math.min(60000, 15000 * (2 ** (pokusaj - 1)))
      );
      console.warn(`Gemini je vratio HTTP 429. Novi pokušaj za ${Math.ceil(odgoda / 1000)} s.`);
      await pricekaj(odgoda);
      return await pozoviGeminiAPI(paketOdlomaka, glosar, apiKey, pokusaj + 1);
    }

    if ([500, 502, 503, 504].includes(response.status)) {
      if (pokusaj > 3) {
        throw new Error(`Gemini privremeno nije dostupan (HTTP ${response.status}) nakon više pokušaja.`);
      }
      const odgoda = pokusaj * 3000;
      await pricekaj(odgoda);
      return await pozoviGeminiAPI(paketOdlomaka, glosar, apiKey, pokusaj + 1);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const poruka = errorData.error?.message || `HTTP greška! Status: ${response.status}`;
      if (/high demand|temporarily unavailable|try again later/i.test(poruka) && pokusaj <= 3) {
        await pricekaj(pokusaj * 3000);
        return await pozoviGeminiAPI(paketOdlomaka, glosar, apiKey, pokusaj + 1);
      }
      throw new Error(poruka);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return [];
    
    const parsed = parsirajLlmJson(rawText, "Gemini analiza");
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Gemini je vratio neispravan JSON odgovor.');
    }
    if (typeof parsed.greska === 'string' && parsed.greska.trim()) {
      return paketOdlomaka.map(item => ({
        index: item.index,
        komentar: `Gemini je prijavio nesigurnost za ovaj paket, ali analiza se nastavlja: ${parsed.greska.trim()}`,
        // Paketna procjena može biti lažno negativna zbog naslova poglavlja,
        // lokacija ili različitih prijeloma odlomaka. Ne smije sama aktivirati
        // zaštitu za pet uzastopnih neispravnih prijevoda.
        ispravanPrijevod: true,
        spojeniOdlomci: Boolean(item.spojeniOdlomci),
        paketnaNeusklađenost: true
      }));
    }
    if (!Array.isArray(parsed.analiza)) {
      throw new Error('Gemini odgovor analize nema očekivani ključ "analiza".');
    }
    return parsed.analiza.filter(item =>
      item &&
      Number.isInteger(item.index) &&
      typeof item.komentar === 'string' &&
      typeof item.ispravanPrijevod === 'boolean' &&
      typeof item.spojeniOdlomci === 'boolean'
    );

  } catch (err) {
    console.error("Greška unutar pozoviGeminiAPI:", err);
    throw err;
  }
}

export async function poravnajTekstoveSGemini(
  izvorTekst,
  prijevodTekst,
  glosar,
  apiKey,
  onProgress = null,
  predporavnatiSegmenti = null
) {
  const odlomciIzvor = ocistiISpodijeliOdlomke(izvorTekst);
  const odlomciPrijevod = ocistiISpodijeliOdlomke(prijevodTekst);
  const pricekaj = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const poravnatiOdlomci = Array.isArray(predporavnatiSegmenti) && predporavnatiSegmenti.length > 0
    ? predporavnatiSegmenti
    : poravnajSpojeneOdlomke(odlomciIzvor, odlomciPrijevod);
  const sviSegmenti = poravnatiOdlomci.map((seg, index) => ({
    index,
    izvor: seg.izvor || "",
    prijevod: seg.prijevod || "",
    spojeniOdlomci: Boolean(seg.spojeniOdlomci),
    preskoceniUvod: Boolean(seg.preskocenUvod || (
      Array.isArray(seg.preskoceniUvod) && seg.preskoceniUvod.length > 0
    ))
  }));
  const analiziraniSegmenti = sviSegmenti.filter(seg => !seg.preskoceniUvod);
  const ukupnoOdlomaka = analiziraniSegmenti.length;

  console.groupCollapsed(`[Poravnanje] ${sviSegmenti.length} segmenata, ${analiziraniSegmenti.length} za Gemini`);
  console.table(sviSegmenti.map(seg => ({
    index: seg.index,
    preskoceniUvod: seg.preskoceniUvod,
    spojeniOdlomci: seg.spojeniOdlomci,
    izvor: seg.izvor.slice(0, 500),
    prijevod: seg.prijevod.slice(0, 500),
    duljinaIzvor: seg.izvor.length,
    duljinaPrijevod: seg.prijevod.length
  })));
  console.groupEnd();

  const MAX_BATCH_SIZE = 15;
  const MAX_BATCH_CHARS = 8000;
  const paketi = [];
  let trenutniPaket = [];
  let trenutniZnakovi = 0;

  for (const seg of analiziraniSegmenti) {
    const duljina = seg.izvor.length + seg.prijevod.length;
    if (trenutniPaket.length >= MAX_BATCH_SIZE || (trenutniZnakovi + duljina > MAX_BATCH_CHARS && trenutniPaket.length > 0)) {
      paketi.push(trenutniPaket);
      trenutniPaket = [];
      trenutniZnakovi = 0;
    }
    trenutniPaket.push({
      index: seg.index,
      izvor: skratiZaPrompt(seg.izvor, 1500),
      prijevod: skratiZaPrompt(seg.prijevod, 1500),
      spojeniOdlomci: seg.spojeniOdlomci,
      preskoceniUvod: seg.preskoceniUvod
    });
    trenutniZnakovi += duljina;
  }
  if (trenutniPaket.length > 0) paketi.push(trenutniPaket);

  const komentariMap = new Map(
    sviSegmenti
      .filter(seg => seg.spojeniOdlomci || seg.preskoceniUvod)
      .map(seg => [seg.index, [
        seg.spojeniOdlomci
            ? "Napomena: granice odlomaka/stihova u izvorniku i prijevodu nisu jednake; tekst je poravnat kao jedan sadržajni segment."
          : "",
        seg.preskoceniUvod
          ? seg.izvor
            ? "Napomena: ovaj uvodni odlomak izvornika (npr. impressum, predgovor ili zahvale) nema par u prijevodu pa je izostavljen iz poravnanja."
            : "Napomena: ovaj naslovni ili uvodni odlomak prijevoda nema par u izvorniku pa je izostavljen iz poravnanja."
          : ""
      ].filter(Boolean).join(" ")])
  );
  let uzastopnoNeispravnih = 0;
  const vrijemePocetka = performance.now();

  for (let i = 0; i < paketi.length; i++) {
    const paket = paketi[i];
    const obradjeniOdlomci = Math.min((i + 1) * MAX_BATCH_SIZE, ukupnoOdlomaka);
    const postotak = Math.round(((i + 1) / paketi.length) * 100);

    if (typeof onProgress === 'function') {
      onProgress({
        trenutni: obradjeniOdlomci,
        ukupno: ukupnoOdlomaka,
        postotak: postotak,
        poruka: `✨ Gemini analizira paket ${i + 1} od ${paketi.length} (${postotak}%)...`,
        procijenjenoUkupno: null,
        procijenjenoPreostalo: null
      });
    }

    try {
      console.groupCollapsed(`[Gemini paket ${i + 1}/${paketi.length}]`);
      console.table(paket.map(seg => ({
        index: seg.index,
        spojeniOdlomci: seg.spojeniOdlomci,
        preskoceniUvod: seg.preskoceniUvod,
        izvor: seg.izvor,
        prijevod: seg.prijevod
      })));
      console.groupEnd();
      const analizePaketa = await pozoviGeminiAPI(paket, glosar, apiKey);
      if (Array.isArray(analizePaketa)) {
        analizePaketa.forEach(item => {
          if (item && item.index !== undefined) {
            const postojećaNapomena = komentariMap.get(item.index);
            komentariMap.set(item.index, [postojećaNapomena, item.komentar].filter(Boolean).join(" "));
          }
        });
      }
      const statusPoIndeksu = new Map(analizePaketa.map(item => [item.index, item.ispravanPrijevod]));
      for (const stavka of paket) {
        const analizaStavke = analizePaketa.find(item => item.index === stavka.index);
        if (statusPoIndeksu.get(stavka.index) === false && !analizaStavke?.paketnaNeusklađenost) {
          uzastopnoNeispravnih++;
        } else {
          uzastopnoNeispravnih = 0;
        }
        if (uzastopnoNeispravnih >= 5) {
          const error = new Error(
            "Analiza je zaustavljena jer je Gemini označio pet uzastopnih odlomaka kao neispravan ili nepovezan prijevod. " +
            "Provjerite jesu li izvor i prijevod iz istog poglavlja i pokušajte ponovno."
          );
          error.code = 'CONSECUTIVE_TRANSLATION_MISMATCH';
          throw error;
        }
      }
      const prosjecnoTrajanjePaketa = (performance.now() - vrijemePocetka) / (i + 1);
      const ukupnoMs = prosjecnoTrajanjePaketa * paketi.length;
      const preostaloMs = prosjecnoTrajanjePaketa * (paketi.length - i - 1);
      if (typeof onProgress === 'function') {
        onProgress({
          trenutni: obradjeniOdlomci,
          ukupno: ukupnoOdlomaka,
          postotak: postotak,
          poruka: `✨ Gemini analizira paket ${i + 1} od ${paketi.length} (${postotak}%)...`,
          procijenjenoUkupno: ukupnoMs,
          procijenjenoPreostalo: preostaloMs
        });
      }
      // The request limiter above enforces the interval before the next API
      // call. This short pause also gives the browser time to repaint progress.
      await pricekaj(500);
    } catch (err) {
      if (err.code === 'TRANSLATION_MISMATCH' || err.code === 'CONSECUTIVE_TRANSLATION_MISMATCH') {
        throw err;
      }
      const poruka = porukaGreske(err);
      console.error(`Paket ${i + 1} nije obrađen, analiza se nastavlja:`, err);
      paket.forEach(p => komentariMap.set(p.index, `[Greška u analizi paketa: ${poruka}]`));
    }
  }

  return sviSegmenti.map(seg => ({
    izvor: seg.izvor,
    prijevod: seg.prijevod,
    napomena: komentariMap.get(seg.index) || ""
  }));
}

function formatirajTrajanje(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "računanje procjene...";
  const sekunde = Math.max(1, Math.ceil(ms / 1000));
  if (sekunde < 60) return `oko ${sekunde} s`;
  const minute = Math.floor(sekunde / 60);
  const preostaleSekunde = sekunde % 60;
  return preostaleSekunde
    ? `oko ${minute} min ${preostaleSekunde} s`
    : `oko ${minute} min`;
}

export async function zapocniAnaliziranje(projekt) {
  const progressBar = document.getElementById('llm-progress-bar');
  const statusText = document.getElementById('llm-status-text');
  const modal = document.getElementById('llm-status-modal');
  
  const apiKey = dohvatiGeminiKluc();
  if (!apiKey) {
    alert("Nije pronađen Gemini API ključ. Molimo unesite ključ u Postavkama.");
    if (modal) modal.style.display = 'none';
    return;
  }

  if (progressBar) progressBar.style.width = '5%';
  if (statusText) statusText.innerText = "⏳ Dohvaćanje tekstova izvora i prijevoda...";

  try {
    let izvorTekst = "";
    let prijevodTekst = "";

    if (projekt.tekstIzvora && projekt.tekstIzvora.trim().length > 0) {
      // Uobičajen slučaj: tekst je već izvučen i spremljen prilikom spremanja projekta.
      izvorTekst = projekt.tekstIzvora;
    } else {
      // Rubni slučaj: projekt (npr. star zapis iz baze) nema spremljen tekst, ali
      // korisnik trenutno ima otvorenu formu s odabranom, još nespremljenom ePub
      // datotekom - iskoristimo je, a rezultat odmah trajno spremimo u projekt.
      const epubInput = document.getElementById('p-epub-file');
      const epubDatoteka = (epubInput && epubInput.files && epubInput.files[0]) ? epubInput.files[0] : null;

      if (epubDatoteka) {
        if (statusText) statusText.innerText = jePdfDatoteka(epubDatoteka)
          ? "⏳ Čitanje izvornog PDF-a i OCR obrada..."
          : "⏳ Čitanje izvornog ePub-a...";
        izvorTekst = jePdfDatoteka(epubDatoteka)
          ? await dohvatiCijeliTekstIzPdfa(epubDatoteka)
          : await dohvatiCijeliTekstIzEpuba(epubDatoteka);
        projekt.tekstIzvora = izvorTekst;
        await spremiUStorage(projekt);
      }
    }

    if (!izvorTekst || izvorTekst.trim().length === 0) {
      throw new Error("Nije pronađen tekst izvornika. Otvorite projekt za uređivanje, ponovno odaberite ePub/PDF datoteku i spremite projekt.");
    }

    const gdocInput = document.getElementById('p-gdoc-url');
    const inputUrl = (gdocInput && gdocInput.value.trim() !== "") ? gdocInput.value.trim() : null;
    const gdocUrl = projekt.gdocUrl || inputUrl;

    if (projekt.tekstPrijevoda && projekt.tekstPrijevoda.trim().length > 0) {
      prijevodTekst = projekt.tekstPrijevoda;
    } else if (gdocUrl) {
      if (statusText) statusText.innerText = "⏳ Dohvaćanje prijevoda s Google Docsa...";
      prijevodTekst = await dohvatiCijeliTekstIzGDoca(gdocUrl);
      projekt.tekstPrijevoda = prijevodTekst;
      projekt.gdocUrl = gdocUrl;
      await spremiUStorage(projekt);
    }

    if (!prijevodTekst || prijevodTekst.trim().length === 0) {
      throw new Error("Nije pronađen tekst prijevoda.");
    }

    if (statusText) statusText.innerText = "⏳ Normalizacija i strukturiranje tekstova...";
    if (progressBar) progressBar.style.width = '10%';
    const normaliziraniSegmenti = stvoriNormaliziraneSegmente(izvorTekst, prijevodTekst);

    const procisceniIzvor = normaliziraniSegmenti
      .filter(s => s.izvor && s.prijevod)
      .map(s => s.izvor)
      .join("\n\n");
    const procisceniPrijevod = normaliziraniSegmenti
      .filter(s => s.izvor && s.prijevod)
      .map(s => s.prijevod)
      .join("\n\n");
    let glosar = await dohvatiGlosarIzIndexedDB(projekt.id);
    const glosarStavke = glosar && typeof glosar === 'object'
      ? (glosar.terms || glosar.items || glosar.entries)
      : null;
    const imaGlosar = Array.isArray(glosar)
      ? glosar.length > 0
      : Array.isArray(glosarStavke)
        ? glosarStavke.length > 0
        : Boolean(glosar && typeof glosar === 'object' && Object.keys(glosar).length > 0);

    if (!imaGlosar) {
      if (statusText) statusText.innerText = "⏳ Generiranje glosara...";
      try {
        glosar = await stvoriGlosar(skratiZaPrompt(procisceniIzvor), skratiZaPrompt(procisceniPrijevod), apiKey);
        const generiraneStavke = Array.isArray(glosar?.terms)
          ? glosar.terms
          : Array.isArray(glosar)
            ? glosar
            : [];
        if (generiraneStavke.length === 0) {
          throw new Error("Gemini je vratio prazan glosar.");
        }
        const glosarDb = await otvoriBazu();
        const glosarTx = glosarDb.transaction(INTERLINEARNI_STORE, 'readwrite');
        const glosarStore = glosarTx.objectStore(INTERLINEARNI_STORE);
        await new Promise((resolve, reject) => {
          const zahtjev = glosarStore.get(projekt.id);
          zahtjev.onsuccess = () => {
            glosarStore.put({ ...(zahtjev.result || {}), projektId: projekt.id, glosar });
          };
          zahtjev.onerror = () => reject(zahtjev.error);
          glosarTx.oncomplete = resolve;
          glosarTx.onerror = () => reject(glosarTx.error);
        });
      } catch (err) {
        console.error("Glosar nije moguće generirati, analiza se nastavlja bez glosara:", err);
        glosar = {};
        if (statusText) statusText.innerText = `⚠️ Glosar nije generiran; analiza se nastavlja (${porukaGreske(err)}).`;
      }
    }

    if (statusText) statusText.innerText = "⏳ Pokretanje analize odlomaka uz glosar...";
    if (progressBar) progressBar.style.width = '30%';

    const poravnaniRezultat = await poravnajTekstoveSGemini(
      izvorTekst,
      prijevodTekst,
      glosar,
      apiKey,
      (napredak) => {
        const procjena = napredak.procijenjenoUkupno === null
          ? "Procijenjeno trajanje: računanje procjene..."
          : `Procijenjeno trajanje: ${formatirajTrajanje(napredak.procijenjenoUkupno)}; preostalo: ${formatirajTrajanje(napredak.procijenjenoPreostalo)}`;
        if (statusText) {
          statusText.innerText = `${napredak.poruka}\n${procjena}`;
        }
        const prilagodjeniPostotak = 30 + Math.round((napredak.postotak / 100) * 60);
        if (progressBar) progressBar.style.width = `${prilagodjeniPostotak}%`;
      },
      normaliziraniSegmenti
    );

    const komentari = poravnaniRezultat
      .map((item, idx) => item.napomena ? { term: "Gemini Napomena", sugestija: item.napomena, odlomakIndex: idx } : null)
      .filter(Boolean);

    const rezultatObjekt = {
      projektId: projekt.id,
      datumAnalize: new Date().toISOString(),
      segmenti: poravnaniRezultat,
      odlomciIzvor: normaliziraniSegmenti.map(s => s.izvor),
      odlomciPrijevod: normaliziraniSegmenti.map(s => s.prijevod),
      komentari: komentari,
      glosar: glosar,
      // The interlinear view must use the same normalized/aligned segments
      // that were sent to Gemini. Raw paragraph arrays lose 1:2/2:1 joins
      // and make valid translations appear under the wrong source paragraph.
      sourceParagraphs: poravnaniRezultat.map(segment => segment.izvor || ''),
      targetParagraphs: poravnaniRezultat.map(segment => segment.prijevod || '')
    };

    const db = await otvoriBazu();
    const tx = db.transaction(INTERLINEARNI_STORE, 'readwrite');
    const store = tx.objectStore(INTERLINEARNI_STORE);
    store.put(rezultatObjekt);

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    if (modal) modal.style.display = 'none';
    navigirajNa('translation-analytics/interlinear', { projektId: projekt.id });

  } catch (err) {
    console.error("Greška tijekom analize:", err);
    const poruka = err.code === 'TRANSLATION_MISMATCH' || err.code === 'CONSECUTIVE_TRANSLATION_MISMATCH'
      ? err.message
      : "Došlo je do pogreške tijekom tekstualne analize: " + err.message;
    alert(poruka);
    if (modal) modal.style.display = 'none';
  }
}

export async function pokreniTekstualnuAnalizu(projektId, event) {
  if (event) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
  }

  const apiKey = dohvatiGeminiKluc();
  if (!apiKey) {
    alert("U postavkama niste unijeli Gemini API ključ!");
    return;
  }

  const modal = document.getElementById('llm-status-modal');
  // Show immediate feedback before IndexedDB reads or normalization begin.
  // Those operations can take long enough to make a click appear stuck.
  if (modal) modal.style.display = 'flex';
  const db = await otvoriBazu();

  const postojeciRezultat = await new Promise((resolve) => {
    try {
      const tx = db.transaction(INTERLINEARNI_STORE, 'readonly');
      const req = tx.objectStore(INTERLINEARNI_STORE).get(projektId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });

  if (postojeciRezultat) {
    const potvrdi = confirm("Za ovaj projekt već postoji analiza. Nova analiza će resetirati postojeće podatke. Želite li nastaviti?");
    if (!potvrdi) return;
  }

  const projekt = await new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(projektId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });

  if (!projekt) {
    alert("Projekt nije pronađen.");
    return;
  }

  await zapocniAnaliziranje(projekt);
}