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
const GEMINI_REQUEST_TIMEOUT_MS = 90000;
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
  return pripremiTekstZaPoravnanje(tekst);
}

export function pripremiTekstZaPoravnanje(rawTekst) {
  if (!rawTekst) return [];

  const redci = rawTekst
    .replace(/<[^>]*>/g, '')
    .replace(/\u00A0/g, ' ')
    // Google Docs/HTML text can expose vertical-tab and form-feed paragraph
    // separators instead of ordinary newline characters.
    .replace(/[\v\f\u2028\u2029]/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t+/g, ' ')
    .split('\n')
    .map(linija => linija.trim());

  const normaliziraniRedci = [];
  let trenutniBlok = [];
  const dodajBlok = () => {
    if (trenutniBlok.length > 0) normaliziraniRedci.push(trenutniBlok);
    trenutniBlok = [];
  };

  for (const redak of redci) {
    if (redak) {
      trenutniBlok.push(redak);
      continue;
    }
    dodajBlok();
  }
  dodajBlok();

  // Project Gutenberg plain-text sources sometimes put an empty line after
  // every visual line. A missing sentence terminator is the reliable signal
  // that the next block is a continuation rather than a new paragraph.
  const odlomci = [];
  for (const blok of normaliziraniRedci) {
    const prethodni = odlomci[odlomci.length - 1];
    const zadnjiRedak = prethodni?.[prethodni.length - 1] || '';
    const nastavak = prethodni &&
      !pronadiNaslovniMarker(prethodni[0]) &&
      !/[.!?…]["'”’)\]]?\s*$/u.test(zadnjiRedak) &&
      !pronadiNaslovniMarker(blok[0]);
    if (nastavak) {
      prethodni.push(...blok);
    } else {
      odlomci.push(blok);
    }
  }

  // Plain-text exports frequently wrap one prose paragraph at the visual
  // margin, while EPUB/Docs exports use blank lines for paragraph boundaries.
  // Keep explicit structural headings as separate lines, but unwrap ordinary
  // prose before alignment so every wrapped line is not treated as a new
  // paragraph.
  return odlomci.flatMap(redci => {
    const rezultat = [];
    let prozniRedci = [];
    const isprazniProzu = () => {
      if (prozniRedci.length > 0) {
        rezultat.push(prozniRedci.join(' '));
        prozniRedci = [];
      }
    };

    for (const redak of redci) {
      if (jeNaslovPoglavlja(redak) && (redci.length === 1 || pronadiNaslovniMarker(redak))) {
        isprazniProzu();
        rezultat.push(redak);
      } else {
        prozniRedci.push(redak);
      }
    }
    isprazniProzu();
    return rezultat;
  });
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

function normalizirajOdlomak(odlomak) {
  return (odlomak || '').replace(/\s+/g, ' ').trim();
}

const NASLOVNI_MARKERI = [
  'chapter', 'chapitre', 'capitulo', 'capítulo', 'capitolo', 'kapitel', 'teil', 'part', 'section',
  'poglavlje', 'glava', 'kapitola', 'dio', 'prologue', 'prolog', 'prólogo', 'sekcija', 'rozdział',
  'hoofdstuk', 'deel', 'luku', 'osa', 'fejezet', 'rész', 'capitol', 'parte', 'partea', 'część',
  'časť', 'část', 'capítol'
];

function jeVelikoSlovo(znak) {
  return /^\p{Lu}$/u.test(znak);
}

function pronadiNaslovniMarker(tekst) {
  const prviDio = tekst.toLocaleLowerCase().split(/[\s:;–—-]+/u).slice(0, 3);
  return NASLOVNI_MARKERI.find(marker =>
    prviDio.some(token => token === marker)
  );
}

function pretvoriRimskiBroj(token) {
  const cisti = token.toLocaleLowerCase().replace(/[^ivxlcdm]/g, '');
  const bezInterpunkcije = token.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  if (!cisti || cisti !== bezInterpunkcije || !/^[ivxlcdm]+$/u.test(cisti)) return null;
  const vrijednosti = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let rezultat = 0;
  for (let i = 0; i < cisti.length; i++) {
    const vrijednost = vrijednosti[cisti[i]];
    rezultat += vrijednost < (vrijednosti[cisti[i + 1]] || 0) ? -vrijednost : vrijednost;
  }
  return rezultat;
}

function izvuciStrukturuNaslova(odlomak) {
  const tekst = normalizirajOdlomak(odlomak);
  if (!tekst || tekst.length > 220) return { tekst, bodovi: 0, marker: null, brojevi: [], godine: [], naslovniOblik: false };
  const rijeci = tekst.match(/\p{L}+/gu) || [];
  const tokeni = tekst.split(/[\s:;–—-]+/u).filter(Boolean);
  const brojevi = [...tekst.matchAll(/\b\d{1,4}\b/gu)].map(podudaranje => Number(podudaranje[0]));
  const rimski = tokeni.map(pretvoriRimskiBroj).filter(Boolean);
  const godine = brojevi.filter(broj => broj >= 1000 && broj <= 2999);
  const marker = pronadiNaslovniMarker(tekst);
  const zavrsavaRecenicom = /[.!?…]["'”’)\]]?\s*$/u.test(tekst);
  const velikaPocetna = jeVelikoSlovo([...tekst][0] || '');
  const naslovniOblik = rijeci.length > 0 &&
    rijeci.filter(rijec => jeVelikoSlovo([...rijec][0] || '')).length >= Math.max(1, Math.ceil(rijeci.length / 2));
  let bodovi = 0;
  if (marker) bodovi += 5;
  if (brojevi.length > 0 || rimski.length > 0) bodovi += 2;
  if (godine.length > 0 || /,\s*\p{Lu}/u.test(tekst)) bodovi += 1;
  if (velikaPocetna) bodovi += 1;
  if (naslovniOblik) bodovi += 1;
  if (rijeci.length > 0 && rijeci.length <= 12) bodovi += 1;
  if (!zavrsavaRecenicom) bodovi += 1;
  if (zavrsavaRecenicom) bodovi -= 2;
  return { tekst, bodovi, marker, brojevi: [...brojevi, ...rimski], godine, naslovniOblik };
}

export function jeNaslovPoglavlja(odlomak) {
  const struktura = izvuciStrukturuNaslova(odlomak);
  return Boolean(struktura.marker || struktura.bodovi >= 5 ||
    (struktura.bodovi >= 4 && struktura.naslovniOblik));
}

function jeNaslovniDio(odlomak) {
  return izvuciStrukturuNaslova(odlomak).bodovi >= 4;
}

export function razdvojiNaslovOdProze(odlomak) {
  if (!jeNaslovPoglavlja(odlomak)) return [odlomak];

  const granice = [
    odlomak.search(/\s+[“"„«]/),
    odlomak.search(/\s+[–—-]\s+(?=\p{Lu}|[“"„«])/u),
    odlomak.search(/:\s+(?=\p{Lu}|[“"„«])/u),
    odlomak.search(/\s+\(\s*(?=\p{Lu}|[“"„«])/u)
  ].filter(index => index > 0);

  const granica = granice.length > 0 ? Math.min(...granice) : -1;
  if (granica > 0) {
    const naslov = odlomak.slice(0, granica).trim();
    const proza = odlomak.slice(granica).trim();
    if (naslov.length >= 8 && proza.length >= 10) return [naslov, proza];
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

function trosakStruktureNaslova(izvornaStruktura, prijevodnaStruktura) {
  const izvorniNaslov = izvornaStruktura.bodovi >= 4;
  const prijevodniNaslov = prijevodnaStruktura.bodovi >= 4;

  if (!izvorniNaslov && !prijevodniNaslov) return 0;
  if (izvorniNaslov !== prijevodniNaslov) return 3;

  let trosak = 0;
  if (izvornaStruktura.marker !== prijevodnaStruktura.marker) trosak += 0.15;
  if (izvornaStruktura.godine.length > 0 && prijevodnaStruktura.godine.length > 0) {
    trosak += izvornaStruktura.godine.some(godina => prijevodnaStruktura.godine.includes(godina)) ? 0 : 2;
  }
  if (izvornaStruktura.brojevi.length > 0 && prijevodnaStruktura.brojevi.length > 0) {
    trosak += izvornaStruktura.brojevi.some(broj => prijevodnaStruktura.brojevi.includes(broj)) ? 0 : 2;
  }
  return trosak;
}

function poravnajVelikeSkupove(izvor, prijevod, omjer, izvorneVrste, prijevodneVrste, izvorneStrukture, prijevodneStrukture) {
  const rezultat = [];
  let i = 0;
  let j = 0;

  while (i < izvor.length || j < prijevod.length) {
    if (i >= izvor.length) {
      rezultat.push({ izvor: '', prijevod: prijevod[j++], spojeniOdlomci: false });
      continue;
    }
    if (j >= prijevod.length) {
      rezultat.push({ izvor: izvor[i++], prijevod: '', spojeniOdlomci: false });
      continue;
    }

    const normalni = trosakDuljine(izvor[i], prijevod[j], omjer) +
      trosakStruktureNaslova(izvorneStrukture[i], prijevodneStrukture[j]);
    const kandidati = [{
      trosak: normalni,
      duljinaIzvora: 1,
      duljinaPrijevoda: 1
    }];

    if (i + 1 < izvor.length && smijeSpojitiSadrzaj(
      [izvorneVrste[i], izvorneVrste[i + 1]],
      [prijevodneVrste[j]]
    )) {
      kandidati.push({
        trosak: 0.35 + trosakDuljine(`${izvor[i]} ${izvor[i + 1]}`, prijevod[j], omjer),
        duljinaIzvora: 2,
        duljinaPrijevoda: 1
      });
    }
    if (j + 1 < prijevod.length && smijeSpojitiSadrzaj(
      [izvorneVrste[i]],
      [prijevodneVrste[j], prijevodneVrste[j + 1]]
    )) {
      kandidati.push({
        trosak: 0.35 + trosakDuljine(izvor[i], `${prijevod[j]} ${prijevod[j + 1]}`, omjer),
        duljinaIzvora: 1,
        duljinaPrijevoda: 2
      });
    }

    const najbolji = kandidati.reduce((prethodni, trenutni) =>
      trenutni.trosak < prethodni.trosak ? trenutni : prethodni
    );
    rezultat.push({
      izvor: izvor.slice(i, i + najbolji.duljinaIzvora).join(' '),
      prijevod: prijevod.slice(j, j + najbolji.duljinaPrijevoda).join(' '),
      spojeniOdlomci: najbolji.duljinaIzvora !== 1 || najbolji.duljinaPrijevoda !== 1
    });
    i += najbolji.duljinaIzvora;
    j += najbolji.duljinaPrijevoda;
  }

  return rezultat;
}

function poravnajBandedDP(izvor, prijevod, omjer, izvorneVrste, prijevodneVrste, izvorneStrukture, prijevodneStrukture) {
  const sirinaPojasa = Math.max(80, Math.abs(izvor.length - prijevod.length) + 40);
  const troskovi = new Map();
  const potezi = new Map();
  const kljuc = (i, j) => `${i}:${j}`;
  const spremi = (i, j, trosak, potez) => {
    const k = kljuc(i, j);
    if ((troskovi.get(k) ?? Number.POSITIVE_INFINITY) > trosak) {
      troskovi.set(k, trosak);
      potezi.set(k, potez);
    }
  };
  const unutarPojasa = (i, j) => {
    const ocekivaniJ = izvor.length === 0 ? 0 : (i * prijevod.length) / izvor.length;
    return Math.abs(j - ocekivaniJ) <= sirinaPojasa;
  };

  spremi(0, 0, 0, null);
  for (let i = 0; i <= izvor.length; i++) {
    const ocekivaniJ = izvor.length === 0 ? 0 : (i * prijevod.length) / izvor.length;
    const pocetakJ = Math.max(0, Math.floor(ocekivaniJ - sirinaPojasa));
    const krajJ = Math.min(prijevod.length, Math.ceil(ocekivaniJ + sirinaPojasa));
    for (let j = pocetakJ; j <= krajJ; j++) {
      const trenutniTrosak = troskovi.get(kljuc(i, j));
      if (!Number.isFinite(trenutniTrosak)) continue;

      if (j < 8 && i < izvor.length && i < 30 && jeVjerojatnoUvodniOdlomak(izvor[i]) && unutarPojasa(i + 1, j)) {
        spremi(i + 1, j, trenutniTrosak + 0.1, {
          prethodni: [i, j],
          preskocenUvod: true
        });
      }
      if (i < izvor.length && j < prijevod.length && unutarPojasa(i + 1, j + 1)) {
        spremi(
          i + 1,
          j + 1,
          trenutniTrosak +
            trosakDuljine(izvor[i], prijevod[j], omjer) +
            trosakStruktureNaslova(izvorneStrukture[i], prijevodneStrukture[j]),
          { prethodni: [i, j], spojeni: false }
        );
      }
      if (i + 1 < izvor.length && j < prijevod.length && unutarPojasa(i + 2, j + 1) &&
        smijeSpojitiSadrzaj([izvorneVrste[i], izvorneVrste[i + 1]], [prijevodneVrste[j]])) {
        spremi(
          i + 2,
          j + 1,
          trenutniTrosak + 0.35 +
            trosakDuljine(`${izvor[i]} ${izvor[i + 1]}`, prijevod[j], omjer),
          { prethodni: [i, j], spojeni: true }
        );
      }
      if (i < izvor.length && j + 1 < prijevod.length && unutarPojasa(i + 1, j + 2) &&
        smijeSpojitiSadrzaj([izvorneVrste[i]], [prijevodneVrste[j], prijevodneVrste[j + 1]])) {
        spremi(
          i + 1,
          j + 2,
          trenutniTrosak + 0.35 +
            trosakDuljine(izvor[i], `${prijevod[j]} ${prijevod[j + 1]}`, omjer),
          { prethodni: [i, j], razdvojeni: true }
        );
      }
    }
  }

  if (!troskovi.has(kljuc(izvor.length, prijevod.length))) return null;

  const stavke = [];
  let i = izvor.length;
  let j = prijevod.length;
  const preskoceniUvod = [];
  while (i > 0 || j > 0) {
    const potez = potezi.get(kljuc(i, j));
    if (!potez) return null;
    const [prethodniI, prethodniJ] = potez.prethodni;
    if (potez.preskocenUvod) {
      preskoceniUvod.unshift(izvor[i - 1]);
    } else {
      stavke.unshift({
        izvor: izvor.slice(prethodniI, i).join(' '),
        prijevod: prijevod.slice(prethodniJ, j).join(' '),
        spojeniOdlomci: Boolean(potez.spojeni || potez.razdvojeni)
      });
    }
    i = prethodniI;
    j = prethodniJ;
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

export function spojiBlokoveNaslovaPoglavlja(odlomci) {
  const rezultat = [];
  for (let i = 0; i < odlomci.length; i++) {
    const trenutni = odlomci[i];

    if (i > 0 && jeNaslovPoglavlja(odlomci[i - 1]) && jeNaslovniDio(trenutni)) {
      rezultat[rezultat.length - 1] = `${rezultat[rezultat.length - 1]} ${trenutni}`;
      continue;
    }

    if (i + 1 < odlomci.length && jeNaslovniDio(trenutni) && jeNaslovPoglavlja(odlomci[i + 1])) {
      rezultat.push(`${trenutni} ${odlomci[i + 1]}`);
      i += 1;
      continue;
    }

    const razdvojeni = razdvojiNaslovOdProze(trenutni);
    if (razdvojeni.length > 1) {
      rezultat.push(razdvojeni[0], razdvojeni[1]);
      continue;
    }

    if (!jeNaslovPoglavlja(trenutni) && !jeNaslovniDio(trenutni)) {
      rezultat.push(trenutni);
      continue;
    }

    const naslov = [trenutni];
    let j = i + 1;
    while (
      j < odlomci.length &&
      naslov.length < 4 &&
      odlomci[j].length < 180 &&
      !/[.!?…]["'”’)\]]?\s*$/.test(odlomci[j]) &&
      (jeNaslovniDio(odlomci[j]) || jeVjerojatnoStih(odlomci[j], [naslov.join(' ')]))
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
  const izvorneStrukture = izvor.map(izvuciStrukturuNaslova);
  const prijevodneStrukture = prijevod.map(izvuciStrukturuNaslova);
  if (izvor.length * prijevod.length > 1500000) {
    console.warn(`Velik broj odlomaka (${izvor.length} x ${prijevod.length}); koristi se banded DP poravnanje.`);
    const bandedRezultat = poravnajBandedDP(
      izvor,
      prijevod,
      omjer,
      izvorneVrste,
      prijevodneVrste,
      izvorneStrukture,
      prijevodneStrukture
    );
    if (bandedRezultat) return bandedRezultat;
    console.warn('Banded DP nije pronašao put unutar pojasa; koristi se linearni fallback.');
    return poravnajVelikeSkupove(
      izvor,
      prijevod,
      omjer,
      izvorneVrste,
      prijevodneVrste,
      izvorneStrukture,
      prijevodneStrukture
    );
  }
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
        const normalniTrosak = troskovi[i][j] +
          trosakDuljine(izvor[i], prijevod[j], omjer) +
          trosakStruktureNaslova(izvorneStrukture[i], prijevodneStrukture[j]);
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;

  const systemInstructionText = `
Ti si stručnjak za književno prevođenje.
Dat ti je niz odlomaka u obliku JSON liste. Svaki element sadrži 'index', 'izvor' (izvorni tekst) i 'prijevod' (prevedeni tekst).

Tvoj je zadatak analizirati svaki odlomak i, ako u prijevodu postoje stilske pogreške, krivi prijevodi, nekonzistentnost s priloženim glosarom ili propusti u prijevodu idioma, napiši kratku napomenu/komentar na jeziku prijevoda.

Za svaki odlomak najprije procijeni je li 'prijevod' stvarni prijevod odgovarajućeg odlomka iz 'izvor'. Ako je tekst prijevoda iz drugog poglavlja, nepovezan tekst, sažetak umjesto prijevoda ili je očito potpuno pogrešan, postavi "ispravanPrijevod": false. U tom slučaju komentar kratko objasni problem. Ako je prijevod očito ispravan, postavi "ispravanPrijevod": true. Ako si nesiguran zbog poezije, naslova, različitih granica odlomaka, složene strukture ili drugih nejasnih podudarnosti, postavi "ispravanPrijevod": null. Samo "false" povećava zaštitni brojač od pet uzastopnih pogrešaka; "true" i "null" ne smiju aktivirati taj brojač.

Ako su u jednom elementu spojena dva susjedna izvorna odlomka i njihov prijevod, to NIJE pogrešan prijevod: postavi "ispravanPrijevod": true i napomeni da su odlomci spojeni u prijevodu.

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
                ispravanPrijevod: { type: "BOOLEAN", nullable: true },
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

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
      (item.ispravanPrijevod === null || typeof item.ispravanPrijevod === 'boolean') &&
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
          const upozorenje = "Gemini je označio najmanje pet uzastopnih odlomaka kao moguće nepovezane prijevode. " +
            "Analiza se nastavlja jer takva procjena može biti nepouzdana kod strojnih prijevoda, različitih jezika i pomaknutih granica odlomaka.";
          const postojećaNapomena = komentariMap.get(stavka.index);
          komentariMap.set(stavka.index, [postojećaNapomena, upozorenje].filter(Boolean).join(" "));
          console.warn(`[Gemini paket ${i + 1}] ${upozorenje}`);
          uzastopnoNeispravnih = 0;
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

function postaviStatusPoruku(statusText, poruka) {
  if (!statusText) return;
  const statusMessage = document.getElementById('llm-status-message');
  if (statusMessage && statusText.contains(statusMessage)) {
    statusMessage.innerText = poruka;
  } else {
    statusText.innerText = poruka;
  }
}

function postaviProcjenu(statusText, ukupnoMs, preostaloMs) {
  if (!statusText) return;
  const ukupno = document.getElementById('llm-estimated-total');
  const preostalo = document.getElementById('llm-estimated-remaining');
  if (ukupno && preostalo && statusText.contains(ukupno) && statusText.contains(preostalo)) {
    ukupno.innerText = formatirajTrajanje(ukupnoMs);
    preostalo.innerText = formatirajTrajanje(preostaloMs);
  }
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
  postaviStatusPoruku(statusText, "⏳ Dohvaćanje tekstova izvora i prijevoda...");

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
        postaviStatusPoruku(statusText, jePdfDatoteka(epubDatoteka)
          ? "⏳ Čitanje izvornog PDF-a i OCR obrada..."
          : "⏳ Čitanje izvornog ePub-a...");
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
      postaviStatusPoruku(statusText, "⏳ Dohvaćanje prijevoda s Google Docsa...");
      prijevodTekst = await dohvatiCijeliTekstIzGDoca(gdocUrl);
      projekt.tekstPrijevoda = prijevodTekst;
      projekt.gdocUrl = gdocUrl;
      await spremiUStorage(projekt);
    }

    if (!prijevodTekst || prijevodTekst.trim().length === 0) {
      throw new Error("Nije pronađen tekst prijevoda.");
    }

    postaviStatusPoruku(statusText, "⏳ Normalizacija i strukturiranje tekstova...");
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
      postaviStatusPoruku(statusText, "⏳ Generiranje glosara...");
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
        postaviStatusPoruku(statusText, `⚠️ Glosar nije generiran; analiza se nastavlja (${porukaGreske(err)}).`);
      }
    }

    postaviStatusPoruku(statusText, "⏳ Pokretanje analize odlomaka uz glosar...");
    if (progressBar) progressBar.style.width = '30%';

    const poravnaniRezultat = await poravnajTekstoveSGemini(
      izvorTekst,
      prijevodTekst,
      glosar,
      apiKey,
      (napredak) => {
        postaviStatusPoruku(statusText, napredak.poruka);
        if (napredak.procijenjenoUkupno !== null) {
          postaviProcjenu(statusText, napredak.procijenjenoUkupno, napredak.procijenjenoPreostalo);
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
    if (!potvrdi) {
      if (modal) modal.style.display = 'none';
      return;
    }
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