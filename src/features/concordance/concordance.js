// Izvršna logika tekstualne analize, ePub parsiranja i komunikacije s Gemini API-jem

import { otvoriBazu, STORE_NAME, KONKORDANCA_STORE, spremiUStorage } from '../../core/db.js';
import { dohvatiGeminiKluc } from '../../core/state.js';
import { dohvatiCijeliTekstIzGDoca } from '../google-drive/drive.api.js';
import { dohvatiGlosarIzIndexedDB, spremiGlosarUIndexedDB, stvoriGlosar } from '../glossary/glossary.js';
import { prikaziKonkordancu } from './concordance.ui.js';

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
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(linija => linija.trim())
    .filter(linija => linija.length > 0);
}

export function stvoriNormaliziraneSegmente(rawIzvor, rawPrijevod) {
  let izvorLinije = pripremiTekstZaPoravnanje(rawIzvor);
  let prijevodLinije = pripremiTekstZaPoravnanje(rawPrijevod);

  if (izvorLinije.length > prijevodLinije.length && izvorLinije.length > 1) {
    const prvaIzvor = izvorLinije[0].toLowerCase();
    const drugaIzvor = izvorLinije[1].toLowerCase();
    const prvaPrijevod = prijevodLinije[0] ? prijevodLinije[0].toLowerCase() : '';

    if (prvaIzvor === drugaIzvor || prvaIzvor.includes(drugaIzvor) || drugaIzvor === prvaPrijevod) {
      console.log("Detektiran duplikat/naslovnica u ePub izvorniku — uklanjam uvodnu liniju.");
      izvorLinije.shift(); 
    }
  }

  const maxLen = Math.max(izvorLinije.length, prijevodLinije.length);
  const segmenti = [];

  for (let i = 0; i < maxLen; i++) {
    segmenti.push({
      izvor: izvorLinije[i] || '',
      prijevod: prijevodLinije[i] || ''
    });
  }

  return segmenti;
}

export async function dohvatiCijeliTekstIzEpuba(file) {
  if (!file) return "";
  const zip = await JSZip.loadAsync(file);
  const parser = new DOMParser();
  let puniTekst = [];

  for (const filename of Object.keys(zip.files)) {
    if (/\.(xhtml|html|htm)$/i.test(filename)) {
      const html = await zip.files[filename].async("string");
      const doc = parser.parseFromString(html, "text/html");
      const text = doc.body ? doc.body.textContent : "";
      if (text.trim().length > 0) {
        puniTekst.push(text.trim());
      }
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

UVIJEK vrati odgovor u obliku validnog JSON objekta s ključem "analiza" koji sadrži niz objekata formata:
{
  "analiza": [
    {
      "index": broj_indeksa_odlomka,
      "komentar": "Kratka napomena..."
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
    generationConfig: { responseMimeType: "application/json" }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (response.status === 429) {
      if (pokusaj > 3) throw new Error("Premašen limit zahtjeva (Error 429).");
      const odgoda = pokusaj * 2000;
      await new Promise(r => setTimeout(r, odgoda));
      return await pozoviGeminiAPI(paketOdlomaka, glosar, apiKey, pokusaj + 1);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP greška! Status: ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return [];
    
    const parsed = JSON.parse(rawText);
    return parsed.analiza || [];

  } catch (err) {
    console.error("Greška unutar pozoviGeminiAPI:", err);
    throw err;
  }
}

export async function poravnajTekstoveSGemini(izvorTekst, prijevodTekst, glosar, apiKey, onProgress = null) {
  const odlomciIzvor = ocistiISpodijeliOdlomke(izvorTekst);
  const odlomciPrijevod = ocistiISpodijeliOdlomke(prijevodTekst);
  const pricekaj = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const ukupnoOdlomaka = Math.max(odlomciIzvor.length, odlomciPrijevod.length);
  const sviSegmenti = [];
  
  for (let i = 0; i < ukupnoOdlomaka; i++) {
    sviSegmenti.push({
      index: i,
      izvor: odlomciIzvor[i] || "",
      prijevod: odlomciPrijevod[i] || ""
    });
  }

  const MAX_BATCH_SIZE = 15;
  const MAX_BATCH_CHARS = 8000;
  const paketi = [];
  let trenutniPaket = [];
  let trenutniZnakovi = 0;

  for (const seg of sviSegmenti) {
    const duljina = seg.izvor.length + seg.prijevod.length;
    if (trenutniPaket.length >= MAX_BATCH_SIZE || (trenutniZnakovi + duljina > MAX_BATCH_CHARS && trenutniPaket.length > 0)) {
      paketi.push(trenutniPaket);
      trenutniPaket = [];
      trenutniZnakovi = 0;
    }
    trenutniPaket.push({
      index: seg.index,
      izvor: skratiZaPrompt(seg.izvor, 1500),
      prijevod: skratiZaPrompt(seg.prijevod, 1500)
    });
    trenutniZnakovi += duljina;
  }
  if (trenutniPaket.length > 0) paketi.push(trenutniPaket);

  const komentariMap = new Map();

  for (let i = 0; i < paketi.length; i++) {
    const paket = paketi[i];
    const obradjeniOdlomci = Math.min((i + 1) * MAX_BATCH_SIZE, ukupnoOdlomaka);
    const postotak = Math.round(((i + 1) / paketi.length) * 100);

    if (typeof onProgress === 'function') {
      onProgress({
        trenutni: obradjeniOdlomci,
        ukupno: ukupnoOdlomaka,
        postotak: postotak,
        poruka: `✨ Gemini analizira paket ${i + 1} od ${paketi.length} (${postotak}%)...`
      });
    }

    try {
      const analizePaketa = await pozoviGeminiAPI(paket, glosar, apiKey);
      if (Array.isArray(analizePaketa)) {
        analizePaketa.forEach(item => {
          if (item && item.index !== undefined) komentariMap.set(item.index, item.komentar || "");
        });
      }
      await pricekaj(1500);
    } catch (err) {
      paket.forEach(p => komentariMap.set(p.index, `[Greška u analizi paketa: ${err.message}]`));
    }
  }

  return sviSegmenti.map(seg => ({
    izvor: seg.izvor,
    prijevod: seg.prijevod,
    napomena: komentariMap.get(seg.index) || ""
  }));
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

    const epubInput = document.getElementById('p-epub-file');
    let epubDatoteka = (epubInput && epubInput.files && epubInput.files[0]) ? epubInput.files[0] : projekt.epubBlob;

    if (epubDatoteka) {
      if (statusText) statusText.innerText = "⏳ Čitanje izvornog ePub-a...";
      izvorTekst = await dohvatiCijeliTekstIzEpuba(epubDatoteka);
      projekt.tekstIzvora = izvorTekst;
      projekt.epubBlob = epubDatoteka;
      await spremiUStorage(projekt);
    } else if (projekt.tekstIzvora) {
      izvorTekst = projekt.tekstIzvora;
    }

    if (!izvorTekst || izvorTekst.trim().length === 0) {
      throw new Error("Nije pronađen tekst izvornika.");
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

    const procisceniIzvor = normaliziraniSegmenti.map(s => s.izvor).join("\n\n");
    const procisceniPrijevod = normaliziraniSegmenti.map(s => s.prijevod).join("\n\n");

    let glosar = await dohvatiGlosarIzIndexedDB(projekt.id);
    if (!glosar) {
      if (statusText) statusText.innerText = "⏳ Generiranje glosara...";
      glosar = await stvoriGlosar(skratiZaPrompt(procisceniIzvor), skratiZaPrompt(procisceniPrijevod), apiKey);
      await spremiGlosarUIndexedDB(projekt.id, glosar);
    }

    if (statusText) statusText.innerText = "⏳ Pokretanje analize odlomaka uz glosar...";
    if (progressBar) progressBar.style.width = '30%';

    const poravnaniRezultat = await poravnajTekstoveSGemini(
      procisceniIzvor, 
      procisceniPrijevod, 
      glosar,
      apiKey,
      (napredak) => {
        if (statusText) statusText.innerText = napredak.poruka;
        const prilagodjeniPostotak = 30 + Math.round((napredak.postotak / 100) * 60);
        if (progressBar) progressBar.style.width = `${prilagodjeniPostotak}%`;
      }
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
      glosar: glosar
    };

    const db = await otvoriBazu();
    const tx = db.transaction(KONKORDANCA_STORE, 'readwrite');
    const store = tx.objectStore(KONKORDANCA_STORE);
    store.put(rezultatObjekt);

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    if (modal) modal.style.display = 'none';
    await prikaziKonkordancu(projekt.id);  

  } catch (err) {
    console.error("Greška tijekom analize:", err);
    alert("Došlo je do pogreške tijekom tekstualne analize: " + err.message);
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
  const db = await otvoriBazu();

  const postojeciRezultat = await new Promise((resolve) => {
    try {
      const tx = db.transaction(KONKORDANCA_STORE, 'readonly');
      const req = tx.objectStore(KONKORDANCA_STORE).get(projektId);
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

  if (modal) modal.style.display = 'flex';
  await zapocniAnaliziranje(projekt);
}