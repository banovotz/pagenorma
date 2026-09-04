// Enables persistent storage in the browser
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(granted => {
    if (granted) {
      console.log("Data storage is persistent (persist enabled).");
    } else {
      console.warn("The browser may clear data if memory runs low.");
    }
  });
}

const DB_NAME = 'Mojih1500DB';
const DB_VERSION = 6; // glossar 
const STORE_NAME = 'projekti';
const UNOSI_STORE = 'unosi';
const KONKORDANCA_STORE = 'konkordance';
const GLOSAR_STORE = 'glosari';

// Pomoćna funkcija za skraćivanje teksta
function skratiZaPrompt(tekst, maxZnakova = 2000) {
  if (!tekst) return "";
  return tekst.length > maxZnakova ? tekst.substring(0, maxZnakova) + "..." : tekst;
}
/**
 * Opens IndexedDB and creates 'projekti', 'unosi', 'glosari' and 'konkordance' stores.
 */
function otvoriBazu() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(UNOSI_STORE)) {
        const unosiStore = db.createObjectStore(UNOSI_STORE, { keyPath: 'id' });
        unosiStore.createIndex('projektId', 'projektId', { unique: false });
      }

      // Store za konkordancu i rezultate analize
      if (!db.objectStoreNames.contains(KONKORDANCA_STORE)) {
        db.createObjectStore(KONKORDANCA_STORE, { keyPath: 'projektId' });
      }

      // Stvaranje store-a za glosare ako već ne postoji
      if (!db.objectStoreNames.contains(GLOSAR_STORE)) {
        db.createObjectStore(GLOSAR_STORE, { keyPath: "id" });
       }

    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// --- UPRAVLJANJE GEMINI API KLJUČEM ---

function spremiGeminiKluc() {
  const input = document.getElementById('gemini-api-key');
  if (!input || !input.value.trim()) {
    alert("Molimo unesite valjan Gemini API ključ.");
    return;
  }
  localStorage.setItem('gemini_api_key', input.value.trim());
  alert("Gemini API ključ je uspješno spremljen!");
}

function dohvatiGeminiKluc() {
  return localStorage.getItem('gemini_api_key') || "";
}

// --- DOHVAT GOOGLE DOCS TEKSTA ---

/**
 * Dohvaća čisti tekst iz javnog Google Dokumenta na temelju URL-a.
 */
async function dohvatiCijeliTekstIzGDoca(gdocUrl) {
  if (!gdocUrl || typeof gdocUrl !== 'string') return "";

  const match = gdocUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match || !match[1]) {
    throw new Error("Nevažeći Google Docs URL format.");
  }

  const docId = match[1];
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;

  try {
    const response = await fetch(exportUrl);
    if (!response.ok) {
      throw new Error(`Nije moguće dohvatiti Google Doc (Status: ${response.status}). Provjerite je li pristup postavljen na 'Svatko s vezom' (Anyone with the link).`);
    }
    const tekst = await response.text();
    return tekst;
  } catch (err) {
    console.error("Greška pri dohvaćanju Google Dokumenta:", err);
    throw new Error(`Greška pri dohvaćanju Google Doc-a: ${err.message}`);
  }
}

// --- GEMINI API INTEGRACIJA I LOGIKA ANALIZE TEKSTA ---

/**
 * Poziva Google Gemini REST API za analizu odlomka.
 */



/**
 * Poziva Google Gemini REST API za analizu paketa (batcha) odlomaka odjednom.
 */
async function pozoviGeminiAPI(paketOdlomaka, glosar, apiKey, pokusaj = 1) {
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
      "komentar": "Kratka napomena..." // ako nema pogrešaka, ostavi prazan string ""
    }
  ]
}

Nemoj koristiti newline znakove unutar JSON stringova (koristi <br> za prijelom u novi red, <p> za paragrafe i <b>, <i> za formatiranje teksta.).

GLOSAR DOKUMENTA:
${JSON.stringify(glosar, null, 2)}
`;

  const promptText = `Analiziraj sljedeći paket odlomaka:\n\n${JSON.stringify(paketOdlomaka, null, 2)}`;

  const payload = {
    systemInstruction: {
      parts: [{ text: systemInstructionText }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: promptText }]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (response.status === 429) {
      if (pokusaj > 3) {
        throw new Error("Premašen limit zahtjeva (Error 429). Pokušajte ponovno kasnije.");
      }
      const odgoda = pokusaj * 2000;
      console.warn(`Ograničenje brzine (429). Čekam ${odgoda / 1000}s pa pokušavam ponovno (pokušaj ${pokusaj})...`);
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

/**
 * Uspoređuje izvorne i prevedene odlomke grupirajući ih u pakete (batch)
 * radi smanjenja broja API poziva i maksimiziranja payload-a.
 */
async function poravnajTekstoveSGemini(izvorTekst, prijevodTekst, glosar, apiKey, onProgress = null) {
  const odlomciIzvor = ocistiISpodijeliOdlomke(izvorTekst);
  const odlomciPrijevod = ocistiISpodijeliOdlomke(prijevodTekst);
  const pricekaj = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const ukupnoOdlomaka = Math.max(odlomciIzvor.length, odlomciPrijevod.length);
  
  // Priprema svih odlomaka za mapiranje
  const sviSegmenti = [];
  for (let i = 0; i < ukupnoOdlomaka; i++) {
    sviSegmenti.push({
      index: i,
      izvor: odlomciIzvor[i] || "",
      prijevod: odlomciPrijevod[i] || ""
    });
  }

  // Grupiranje u pakete (npr. max 15 odlomaka ili max 8000 znakova po pozivu)
  const MAX_BATCH_SIZE = 15;
  const MAX_BATCH_CHARS = 8000;
  
  const paketi = [];
  let trenutniPaket = [];
  let trenutniZnakovi = 0;

  for (const seg of sviSegmenti) {
    const duljina = seg.izvor.length + seg.prijevod.length;
    
    if (
      trenutniPaket.length >= MAX_BATCH_SIZE || 
      (trenutniZnakovi + duljina > MAX_BATCH_CHARS && trenutniPaket.length > 0)
    ) {
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
  
  if (trenutniPaket.length > 0) {
    paketi.push(trenutniPaket);
  }

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
      
      // Pridruživanje dobivenih komentara odgovarajućem indeksu
      if (Array.isArray(analizePaketa)) {
        analizePaketa.forEach(item => {
          if (item && item.index !== undefined) {
            komentariMap.set(item.index, item.komentar || "");
          }
        });
      }
      
      // Mala stanka između paketa za izbjegavanje spajka na API-ju
      await pricekaj(1500);

    } catch (err) {
      console.warn(`Greška pri Gemini analizi paketa ${i + 1}:`, err);
      // U slučaju greške paketa, označavamo te odlomke porukom o grešci
      paket.forEach(p => {
        komentariMap.set(p.index, `[Greška u analizi paketa: ${err.message}]`);
      });
    }
  }

  // Rekonstrukcija konačnog niza koji se poklapa s izvornim formatom prikaza
  const rezultati = sviSegmenti.map(seg => ({
    izvor: seg.izvor,
    prijevod: seg.prijevod,
    napomena: komentariMap.get(seg.index) || ""
  }));

  if (typeof onProgress === 'function') {
    onProgress({
      trenutni: ukupnoOdlomaka,
      ukupno: ukupnoOdlomaka,
      postotak: 100,
      poruka: "✅ Gemini analiza uspješno završena!"
    });
  }

  return rezultati;
}

// Glavna funkcija za analizu s integriranim glosarom
async function zapocniAnaliziranje(projekt) {
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

    // 1. DOHVAT IZVORNOG TEKSTA IZ EPUB-A (Aktivna datoteka -> Baza Blob -> Tekst iz projekta)
    const epubInput = document.getElementById('p-epub-file');
    let epubDatoteka = (epubInput && epubInput.files && epubInput.files[0]) ? epubInput.files[0] : projekt.epubBlob;

    if (epubDatoteka) {
      if (statusText) statusText.innerText = "⏳ Čitanje izvornog ePub-a...";
      izvorTekst = await dohvatiCijeliTekstIzEpuba(epubDatoteka);
      
      // Ažuriranje i spremanje projekta s pročitanim tekstom i blobom
      projekt.tekstIzvora = izvorTekst;
      projekt.epubBlob = epubDatoteka;
      await spremiUStorage(projekt);
    } else if (projekt.tekstIzvora) {
      izvorTekst = projekt.tekstIzvora;
    }

    if (!izvorTekst || izvorTekst.trim().length === 0) {
      throw new Error("Nije pronađen tekst izvornika. Priložite EPUB datoteku u formi ili projektne podatke.");
    }

    // 2. DOHVAT TEKSTA PRIJEVODA IZ GOOGLE DOCS-A ILI PROJEKTA
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
      throw new Error("Nije pronađen tekst prijevoda. Unesite Google Docs URL ili spremljeni prijevod.");
    }

    // 3. NORMALIZACIJA I STRUKTURIRANJE TEKSTOVA
    if (statusText) statusText.innerText = "⏳ Normalizacija i strukturiranje tekstova...";
    if (progressBar) progressBar.style.width = '10%';
    const normaliziraniSegmenti = stvoriNormaliziraneSegmente(izvorTekst, prijevodTekst);

    const procisceniIzvor = normaliziraniSegmenti.map(s => s.izvor).join("\n\n");
    const procisceniPrijevod = normaliziraniSegmenti.map(s => s.prijevod).join("\n\n");

    // 4. PROVJERA / STVARANJE GLOSARA (PROLAZ 1)
    if (statusText) statusText.innerText = "⏳ Provjera glosara u bazi...";
    if (progressBar) progressBar.style.width = '15%';

    let glosar = await dohvatiGlosarIzIndexedDB(projekt.id);

    if (!glosar) {
      if (statusText) statusText.innerText = "⏳ Generiranje glosara i terminologije (Prolaz 1)...";
      if (progressBar) progressBar.style.width = '20%';

      glosar = await stvoriGlosar(
        skratiZaPrompt(procisceniIzvor), 
        skratiZaPrompt(procisceniPrijevod), 
        apiKey
      );

      await spremiGlosarUIndexedDB(projekt.id, glosar);
      if (statusText) statusText.innerText = "✅ Glosar uspješno stvoren i spremljen.";
    }

    // 5. GEMINI ANALIZA PO ODLOMCIMA UZ GLOSAR (PROLAZ 2)
    if (statusText) statusText.innerText = "⏳ Pokretanje analize odlomaka uz glosar...";
    if (progressBar) progressBar.style.width = '30%';

    const poravnaniRezultat = await poravnajTekstoveSGemini(
      procisceniIzvor, 
      procisceniPrijevod, 
      glosar,
      apiKey,
      (napredak) => {
        if (statusText) statusText.innerText = napredak.poruka;
        // Skaliranje napretka poravnanja s 30% na 90% na traci napretka
        const prilagodjeniPostotak = 30 + Math.round((napredak.postotak / 100) * 60);
        if (progressBar) progressBar.style.width = `${prilagodjeniPostotak}%`;
      }
    );

    // 6. SPREMANJE REZULTATA ANALIZE U INDEXEDDB
    if (statusText) statusText.innerText = "⏳ Spremanje rezultata analize...";
    if (progressBar) progressBar.style.width = '95%';

    const odlomciIzvor = normaliziraniSegmenti.map(s => s.izvor);
    const odlomciPrijevod = normaliziraniSegmenti.map(s => s.prijevod);

    const komentari = poravnaniRezultat
      .map((item, idx) => item.napomena ? { term: "Gemini Napomena", sugestija: item.napomena, odlomakIndex: idx } : null)
      .filter(Boolean);

    const rezultatObjekt = {
      projektId: projekt.id,
      datumAnalize: new Date().toISOString(),
      segmenti: poravnaniRezultat,
      odlomciIzvor: odlomciIzvor,
      odlomciPrijevod: odlomciPrijevod,
      komentari: komentari,
      glosar: glosar
    };

    const db = await otvoriBazu();
    const storeName = typeof KONKORDANCA_STORE !== 'undefined' ? KONKORDANCA_STORE : 'konkordance';
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    const request = store.put(rezultatObjekt);

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      request.onerror = () => reject(request.error);
    });

    if (progressBar) progressBar.style.width = '100%';

    // 7. ZAVRŠETAK I PRIKAZ
    if (modal) modal.style.display = 'none';

    if (typeof sakrijUcitavanje === 'function') sakrijUcitavanje();
    
    await prikaziKonkordancu(projekt.id);  

  } catch (err) {
    console.error("Greška tijekom analize:", err);
    alert("Došlo je do pogreške tijekom tekstualne analize: " + err.message);
    if (modal) modal.style.display = 'none';
  }
}
// Pokretačka funkcija s interfejsom modala
async function pokreniTekstualnuAnalizu(projektId, event) {
  if (event) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
  }

  const apiKey = dohvatiGeminiKluc();
  if (!apiKey) {
    alert("U postavkama niste unijeli Gemini API ključ!");
    prikaziStranicu('settings-page');
    return;
  }

  const modal = document.getElementById('llm-status-modal');
  const infoBox = document.getElementById('llm-info-box');
  const progressContainer = document.getElementById('llm-progress-container');
  const progressBar = document.getElementById('llm-progress-bar');
  const statusText = document.getElementById('llm-status-text');
  const btnDownload = document.getElementById('btn-zapocni-download');

  const storeProjekti = typeof STORE_NAME !== 'undefined' ? STORE_NAME : 'projekti';
  const storeKonkordanca = typeof KONKORDANCA_STORE !== 'undefined' ? KONKORDANCA_STORE : 'konkordance';

  try {
    const db = await otvoriBazu();

    const postojeciRezultat = await new Promise((resolve) => {
      try {
        const tx = db.transaction(storeKonkordanca, 'readonly');
        const store = tx.objectStore(storeKonkordanca);
        const req = store.get(projektId);
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
      const tx = db.transaction(storeProjekti, 'readonly');
      const store = tx.objectStore(storeProjekti);
      const req = store.get(projektId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    if (!projekt) {
      alert("Projekt nije pronađen.");
      return;
    }

    if (modal) modal.style.display = 'flex';
    if (infoBox) infoBox.style.display = 'none';
    if (btnDownload) btnDownload.style.display = 'none';
    if (progressContainer) progressContainer.style.display = 'block';

    await zapocniAnaliziranje(projekt);

  } catch (err) {
    console.error("Greška u pokreniTekstualnuAnalizu:", err);
    alert("Došlo je do pogreške pri pokretanju analize: " + err.message);
    if (modal) modal.style.display = 'none';
  }
}

/**
 * Ekstrahira puni tekst iz ePub datoteke pomoću JSZip-a.
 */
async function dohvatiCijeliTekstIzEpuba(file) {
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

/**
 * Pomoćna funkcija za čišćenje i podjelu teksta na odlomke.
 */
function ocistiISpodijeliOdlomke(tekst) {
  if (!tekst) return [];
  return tekst
    .split(/\n\s*\n/)
    .map(o => o.trim())
    .filter(o => o.length > 0);
}

/**
 * Čisti ulazni tekst od nevidljivih razmaka, normalizira nove redove
 * i vraća čisti niz odlomaka bez praznih linija.
 */
function pripremiTekstZaPoravnanje(rawTekst) {
  if (!rawTekst) return [];

  return rawTekst
    .replace(/<[^>]*>/g, '')         // Uklanja HTML tagove iz ePub-a
    .replace(/\u00A0/g, ' ')        // Zamjenjuje nevidljive &nbsp; razmake
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(linija => linija.trim())
    .filter(linija => linija.length > 0);
}

/**
 * Normalizira i spaja izvor i prijevod.
 */
function stvoriNormaliziraneSegmente(rawIzvor, rawPrijevod) {
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

// --- PRIKAZ KONKORDANCE I SINKRONIZIRANI SKROL ---

async function prikaziKonkordancu(projektId) {
  console.log("Otvori konkordancu za projekt ID:", projektId);

  const db = await otvoriBazu();
  const tx = db.transaction(KONKORDANCA_STORE, 'readonly');
  const store = tx.objectStore(KONKORDANCA_STORE);
  
  let rezultat = await new Promise((resolve) => {
    const req = store.get(projektId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });

  if (!rezultat && typeof projektId === 'string' && !isNaN(projektId)) {
    rezultat = await new Promise((resolve) => {
      const req = store.get(Number(projektId));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  if (typeof prikaziStranicu === 'function') {
    prikaziStranicu('concordance-page');
  }

  const colIzvor = document.getElementById('col-izvor');
  const colPrijevod = document.getElementById('col-prijevod');
  const colKomentari = document.getElementById('col-komentari');

  if (colIzvor && colPrijevod && colKomentari) {
    colIzvor.innerHTML = '';
    colPrijevod.innerHTML = '';
    colKomentari.innerHTML = '';

    if (!rezultat || !rezultat.segmenti || rezultat.segmenti.length === 0) {
      colIzvor.innerHTML = '<p class="text-muted">Nema podataka za prikaz.</p>';
      return;
    }

    rezultat.segmenti.forEach((seg, idx) => {
      const pIndex = idx + 1;
      const komentarZaOdlomak = rezultat.komentari 
        ? rezultat.komentari.find(k => k.odlomakIndex === idx) 
        : null;

      // 1. Stupac Izvornika
      const divIzvor = document.createElement('div');
      divIzvor.className = 'segment-item para-box';
      divIzvor.dataset.index = idx;
      divIzvor.innerHTML = `<small style="color:#008080; font-weight:bold;">#${pIndex}</small><br>${seg.izvor || '<em>(Prazno)</em>'}`;
      colIzvor.appendChild(divIzvor);

      // 2. Stupac Prijevoda
      const divPrijevod = document.createElement('div');
      divPrijevod.className = 'segment-item para-box';
      divPrijevod.dataset.index = idx;
      divPrijevod.innerHTML = `<small style="color:#2e7d32; font-weight:bold;">#${pIndex}</small><br>${seg.prijevod || '<em>(Prazno)</em>'}`;
      colPrijevod.appendChild(divPrijevod);

      // 3. Stupac LLM Komentara
      const divKomentar = document.createElement('div');
      divKomentar.className = 'segment-item para-box';
      divKomentar.dataset.index = idx;
      
      if (komentarZaOdlomak && (komentarZaOdlomak.sugestija || komentarZaOdlomak.term)) {
        divKomentar.innerHTML = `
          <div style="background: #f3e5f5; border-left: 3px solid #8e24aa; padding: 6px; border-radius: 4px; font-size: 0.85em;">
            <strong style="color: #8e24aa;">✨ Gemini Napomena #${pIndex}:</strong><br>
            ${komentarZaOdlomak.sugestija || komentarZaOdlomak.term}
          </div>
        `;
      } else {
        divKomentar.innerHTML = `<small style="color:#ccc;">#${pIndex}</small> <span style="color:#eee;">—</span>`;
      }
      colKomentari.appendChild(divKomentar);
    });

    setTimeout(() => {
      const iNodes = colIzvor.querySelectorAll('.para-box');
      const pNodes = colPrijevod.querySelectorAll('.para-box');
      const kNodes = colKomentari.querySelectorAll('.para-box');

      iNodes.forEach((node, idx) => {
        const h1 = node.offsetHeight;
        const h2 = pNodes[idx] ? pNodes[idx].offsetHeight : 0;
        const h3 = kNodes[idx] ? kNodes[idx].offsetHeight : 0;
        const maxHeight = Math.max(h1, h2, h3);

        node.style.minHeight = `${maxHeight}px`;
        if (pNodes[idx]) pNodes[idx].style.minHeight = `${maxHeight}px`;
        if (kNodes[idx]) kNodes[idx].style.minHeight = `${maxHeight}px`;
      });
    }, 50);

    sinkronizirajTrostrukiSkrol(colIzvor, colPrijevod, colKomentari);
  }
}

function sinkronizirajTrostrukiSkrol(...elements) {
  let isSyncing = false;
  elements.forEach(el => {
    if (!el) return;
    el.onscroll = () => {
      if (!isSyncing) {
        isSyncing = true;
        const currentTop = el.scrollTop;
        elements.forEach(target => {
          if (target && target !== el) {
            target.scrollTop = currentTop;
          }
        });
        isSyncing = false;
      }
    };
  });
}

function renderKonkordancaStupci(data) {
  const colIzvor = document.getElementById('col-izvor');
  const colPrijevod = document.getElementById('col-prijevod');
  const colKomentari = document.getElementById('col-komentari');

  if (!colIzvor || !colPrijevod || !colKomentari) return;

  colIzvor.innerHTML = '';
  colPrijevod.innerHTML = '';
  colKomentari.innerHTML = '';

  const maxLen = Math.max(data.odlomciIzvor.length, data.odlomciPrijevod.length);

  for (let i = 0; i < maxLen; i++) {
    const pIzvorText = data.odlomciIzvor[i] || '';
    const pPrijevodText = data.odlomciPrijevod[i] || '';

    const divIzvor = document.createElement('div');
    divIzvor.className = 'para-box';
    divIzvor.dataset.index = i;
    divIzvor.innerText = pIzvorText;

    const divPrijevod = document.createElement('div');
    divPrijevod.className = 'para-box';
    divPrijevod.dataset.index = i;
    divPrijevod.innerText = pPrijevodText;

    colIzvor.appendChild(divIzvor);
    colPrijevod.appendChild(divPrijevod);
  }

  setTimeout(() => {
    const izvorNodes = colIzvor.querySelectorAll('.para-box');
    const prijevodNodes = colPrijevod.querySelectorAll('.para-box');

    izvorNodes.forEach((node, idx) => {
      if (prijevodNodes[idx]) {
        const maxHeight = Math.max(node.offsetHeight, prijevodNodes[idx].offsetHeight);
        node.style.minHeight = `${maxHeight}px`;
        prijevodNodes[idx].style.minHeight = `${maxHeight}px`;
      }
    });
  }, 50);

  if (Array.isArray(data.komentari)) {
    data.komentari.forEach((k) => {
      const card = document.createElement('div');
      card.className = 'comment-card';
      card.innerHTML = `
        <div style="font-weight: bold; color: #008080;">📌 ${k.term}</div>
        <div style="font-size: 0.88em; margin: 4px 0;">${k.sugestija}</div>
        <button class="btn-jump" onclick="skociNaOdlomak(${k.odlomakIndex || 0}, '${k.term}')">
          🔍 Skoči na mjesto u tekstu
        </button>
      `;
      colKomentari.appendChild(card);
    });
  }

  sinkronizirajSkrol(colIzvor, colPrijevod);
}

function sinkronizirajSkrol(el1, el2) {
  if (!el1 || !el2) return;
  let isSyncing = false;
  el1.onscroll = () => {
    if (!isSyncing) {
      isSyncing = true;
      el2.scrollTop = el1.scrollTop;
    }
    isSyncing = false;
  };
  el2.onscroll = () => {
    if (!isSyncing) {
      isSyncing = true;
      el1.scrollTop = el2.scrollTop;
    }
    isSyncing = false;
  };
}

function skociNaOdlomak(index, term) {
  const colIzvor = document.getElementById('col-izvor');
  if (!colIzvor) return;
  const target = colIzvor.querySelector(`.para-box[data-index="${index}"]`);
  
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.style.background = '#fff9c4';
    setTimeout(() => {
      target.style.background = '#fff';
    }, 2000);
  }
}

/**
 * SAVE TO INDEXEDDB 
 */
async function spremiUStorage(projekt) {
  try {
    const db = await otvoriBazu();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(projekt);

      tx.oncomplete = () => {
        console.log("Project successfully saved to IndexedDB:", projekt.id);
        resolve(true);
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("Error in spremiUStorage:", err);
  }
}

// --- MATH & HELPER FUNCTIONS ---
function izracunajRadneDane(pocetak, kraj, radVikendom) {
  let d = new Date(pocetak);
  const krajDate = new Date(kraj);
  let count = 0;

  while (d <= krajDate) {
    const dayOfWeek = d.getDay();
    if (radVikendom || (dayOfWeek !== 0 && dayOfWeek !== 6)) {
      count++;
    }
    d.setDate(d.getDate() + 1);
  }
  return Math.max(1, count);
}

// --- INITIALIZATION ---
async function inicijalizirajAplikaciju() {
  try {
    console.log("Initializing application and fetching projects...");
    await otvoriBazu();

    if (typeof ucitajDashboard === 'function') {
      await ucitajDashboard();
    } else if (typeof renderDashboard === 'function') {
      await renderDashboard();
    }
  } catch (err) {
    console.error("Error initializing application:", err);
  }
}

let aplikacijaInicijalizirana = false;

async function pokreniAplikaciju() {
  if (aplikacijaInicijalizirana) return;
  aplikacijaInicijalizirana = true;

  try {
    await otvoriBazu();
    await ucitajDashboard();

    const savedKey = dohvatiGeminiKluc();
    const input = document.getElementById('gemini-api-key');
    if (savedKey && input) {
      input.value = savedKey;
    }
  } catch (err) {
    console.error("Error starting application:", err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', pokreniAplikaciju);
} else {
  pokreniAplikaciju();
}

function postaviZadaneDatume() {
  const danas = new Date().toISOString().split('T')[0];
  const startEl = document.getElementById('p-start');
  if (startEl) startEl.value = danas;
}

async function spremiProjektForma(event) {
  event.preventDefault();

  const id = document.getElementById('p-id').value || 'proj_' + Date.now();
  const postojeciProjekt = await dohvatiProjektPoId(id);
  const epubInput = document.getElementById('p-epub-file');
  
  let epubBlob = postojeciProjekt ? postojeciProjekt.epubBlob || null : null;
  let epubNazivDatoteke = postojeciProjekt ? postojeciProjekt.epubNazivDatoteke || null : null;

  if (epubInput && epubInput.files && epubInput.files[0]) {
    epubBlob = epubInput.files[0];
    epubNazivDatoteke = epubInput.files[0].name;
  }

  const noviProjekt = {
    id: id,
    naslov: document.getElementById('p-naslov').value,
    klijent: document.getElementById('p-klijent').value,
    ukupnoKartica: parseFloat(document.getElementById('p-ukupno').value) || 0,
    honorarPoKartici: parseFloat(document.getElementById('p-honorar').value) || 0,
    datumPocetka: document.getElementById('p-start').value,
    datumRoka: document.getElementById('p-rok').value,
    ciljDnevno: parseFloat(document.getElementById('p-cilj-dnevno').value) || 0,
    radVikendom: document.getElementById('p-vikend').value,
    
    naslovnicaBase64: document.getElementById('p-naslovnica-base64').value || null,
    slovaOriginal: parseInt(document.getElementById('p-slova-original').value) || 0,
    slovaPrijevod: parseInt(document.getElementById('p-slova-prijevod').value) || 0,
    gdocUrl: document.getElementById('p-gdoc-url') ? document.getElementById('p-gdoc-url').value : null,
    lastSynced: document.getElementById('p-last-synced').value || null,
    
    // Spremanje Blob-a i izvornog naziva datoteke
    epubBlob: epubBlob,
    epubNazivDatoteke: epubNazivDatoteke,
    tekstIzvora: postojeciProjekt ? postojeciProjekt.tekstIzvora || null : null
  };

  await spremiUStorage(noviProjekt);
  
  toggleFormaProjekta(true);
  await ucitajDashboard();
}

function izracunajPreostaleDane(datumRokaStr, radVikendom) {
  const danas = new Date();
  danas.setHours(0, 0, 0, 0);

  const rok = new Date(datumRokaStr);
  rok.setHours(0, 0, 0, 0);

  if (rok < danas) return 0;

  let preostaloDana = 0;
  let tekuciDatum = new Date(danas);

  while (tekuciDatum <= rok) {
    const danUTjednu = tekuciDatum.getDay();
    const jeVikend = (danUTjednu === 0 || danUTjednu === 6);

    if (radVikendom === 'da' || !jeVikend) {
      preostaloDana++;
    }
    tekuciDatum.setDate(tekuciDatum.getDate() + 1);
  }

  return preostaloDana;
}

async function ucitajDashboard() {
  const dashboardDiv = document.getElementById('dashboard-page');
  if (!dashboardDiv) return;

  dashboardDiv.innerHTML = '';

  try {
    const db = await otvoriBazu();
    
    const txProjekti = db.transaction(STORE_NAME, 'readonly');
    const storeProjekti = txProjekti.objectStore(STORE_NAME);
    const projekti = await new Promise((res, rej) => {
      const req = storeProjekti.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    if (!projekti || projekti.length === 0) {
      dashboardDiv.innerHTML = '<p class="text-muted" style="text-align:center; padding: 20px;">You currently have no active projects. Click on "+ New Project".</p>';
      return;
    }

    const txUnosi = db.transaction(UNOSI_STORE, 'readonly');
    const storeUnosi = txUnosi.objectStore(UNOSI_STORE);
    const sviUnosi = await new Promise((res, rej) => {
      const req = storeUnosi.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    const fragment = document.createDocumentFragment();

    projekti.forEach(p => {
      const unosiProjekta = sviUnosi.filter(u => u.projektId === p.id);
      const rucnoKartica = unosiProjekta.reduce((sum, u) => sum + (parseFloat(u.kartica) || 0), 0);
      
      const odradjenoKartica = ((p.slovaPrijevod || 0) / 1800) + rucnoKartica;
      const ukupnoKartica = parseFloat(p.ukupnoKartica) || 0;
      const preostaloKartica = Math.max(0, ukupnoKartica - odradjenoKartica);
      const postotak = ukupnoKartica > 0 ? Math.min(100, Math.round((odradjenoKartica / ukupnoKartica) * 100)) : 0;

      const primarniGumbHtml = `<button onclick="rucniUnosZnakova('${p.id}')" class="btn-primary" style="padding: 6px 12px; font-size: 0.85em; background: #008080; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
          📝 Unos znakova 
         </button>`;
           
      const preostaloDana = izracunajPreostaleDane(p.datumRoka, p.radVikendom);
      const planiranoDnevno = parseFloat(p.ciljDnevno) || 0;
      let dnevniRitamText = '';

      if (postotak >= 100) {
        dnevniRitamText = `<span style="color: #2e7d32; font-weight: bold;">🎉 Project completed!</span>`;
      } else if (preostaloDana <= 0) {
        dnevniRitamText = `<span style="color: #c62828; font-weight: bold;">⚠️ Deadline has passed!</span>`;
      } else {
        const potrebnoDnevnoNum = preostaloKartica / preostaloDana;
        const potrebnoDnevno = (preostaloKartica / preostaloDana).toFixed(2);
        const vikendOpaska = p.radVikendom === 'da' ? 'days (including weekends)' : 'business days';

        const jeUZaostatku = planiranoDnevno > 0 && potrebnoDnevnoNum > planiranoDnevno;
        const markBojaPozadine = jeUZaostatku ? '#fde8e8' : '#e6f2f2';
        const markBojaTeksta = jeUZaostatku ? '#c62828' : '#008080';
        
        dnevniRitamText = `
          <div><strong>Planned pace:</strong> ${planiranoDnevno > 0 ? `${planiranoDnevno} pages/day` : '<span class="text-muted">Not set</span>'}</div>
          <div style="margin-top: 2px;">
            <strong>Required pace:</strong> 
            <mark style="background: ${markBojaPozadine}; color: ${markBojaTeksta}; padding: 2px 6px; border-radius: 4px; font-weight: bold;">
              ${potrebnoDnevno} pages/day
            </mark> 
            <small class="text-muted">(${preostaloDana} ${vikendOpaska} until deadline)</small>
          </div>
        `;
      }

      const honorarPoKartici = parseFloat(p.honorarPoKartici) || 0;
      const ukupniHonorar = (ukupnoKartica * honorarPoKartici).toFixed(2);
      const zaradjenoDoSada = (odradjenoKartica * honorarPoKartici).toFixed(2);

      const naslovnicaHtml = p.naslovnicaBase64 
        ? `<img src="${p.naslovnicaBase64}" alt="Cover" style="width: 75px; height: 110px; object-fit: cover; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.15); flex-shrink: 0;">`
        : `<div style="width: 75px; height: 110px; background: #e0e0e0; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #777; flex-shrink: 0;">📖</div>`;

      const card = document.createElement('div');
      card.className = 'card-projekt';
      card.style = 'background: #fff; border-radius: 10px; padding: 16px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #eef2f2;';
      card.innerHTML = `
        <div style="display: flex; gap: 16px; align-items: flex-start;">
          ${naslovnicaHtml}
          <div style="flex-grow: 1;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 4px;">
              <h3 style="margin: 0; color: #008080; font-size: 1.2em;">${p.naslov}</h3>
            </div>
            <div style="font-size: 0.88em; color: #666; margin-bottom: 8px;">${p.klijent || 'Independent project'}</div>
            
            <div style="margin-bottom: 6px; font-size: 0.9em;">
              <strong>Progress:</strong> ${odradjenoKartica.toFixed(2)} / ${ukupnoKartica.toFixed(2)} pages 
              <span style="color: #008080; font-weight: bold;">(${postotak}%)</span>
              <br><small class="text-muted">Translation contains ${(p.slovaPrijevod || 0).toLocaleString('en-US')} characters with spaces.</small>
            </div>

            <div style="background: #e6f2f2; border-radius: 6px; height: 10px; overflow: hidden; margin-bottom: 10px;">
              <div style="background: #008080; width: ${postotak}%; height: 100%; transition: width 0.3s ease;"></div>
            </div>

            <div style="font-size: 0.88em; margin-bottom: 10px;">
              ${dnevniRitamText}
            </div>

            <div style="background: #f9fbfb; padding: 8px 12px; border-radius: 6px; font-size: 0.88em; margin-bottom: 12px; border-left: 3px solid #008080; display: flex; justify-content: space-between;">
              <span><strong>Earnings:</strong> €${zaradjenoDoSada} / €${ukupniHonorar}</span>
              <span style="color: #666;">(€${honorarPoKartici.toFixed(2)}/page)</span>
            </div>

            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                ${primarniGumbHtml}
                <button onclick="urediProjekt('${p.id}')" class="btn-secondary" style="padding: 6px 12px; font-size: 0.85em;">✏️ Edit</button>
                <button onclick="obrisiProjekt('${p.id}')" class="btn-secondary" style="padding: 6px 12px; font-size: 0.85em; color: #c62828;">🗑️ Delete</button>
                <button type="button" onclick="pokreniTekstualnuAnalizu('${p.id}', event)" class="btn-secondary" style="padding: 6px 12px; font-size: 0.85em; background: #f0f7f7; color: #008080; border: 1px solid #008080;">🧠 Tekstualna analiza </button>
              </div>
            </div>
          </div>
        </div>
      `;

      fragment.appendChild(card);
    });

    dashboardDiv.appendChild(fragment);

  } catch (err) {
    console.error("Error loading dashboard:", err);
  }
}

async function dodajUnosForma(e, projektId) {
  e.preventDefault();
  const datum = document.getElementById(`u-datum-${projektId}`).value;
  const brojKartica = parseFloat(document.getElementById(`u-kartice-${projektId}`).value);

  const unos = {
    id: 'log_' + crypto.randomUUID(),
    projektId,
    datum,
    brojKartica
  };

  const db = await otvoriBazu();
  const tx = db.transaction('unosi', 'readwrite');
  tx.objectStore('unosi').put(unos);

  tx.oncomplete = () => ucitajDashboard();
}

async function obrisiUnos(unosId) {
  const db = await otvoriBazu();
  const tx = db.transaction('unosi', 'readwrite');
  tx.objectStore('unosi').delete(unosId);
  tx.oncomplete = () => ucitajDashboard();
}

async function urediProjekt(id) {
  const db = await otvoriBazu();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  
  const request = store.get(id);
  request.onsuccess = () => {
    const p = request.result;
    if (!p) return;

    document.getElementById('p-id').value = p.id;
    document.getElementById('p-naslov').value = p.naslov || '';
    document.getElementById('p-klijent').value = p.klijent || '';
    document.getElementById('p-ukupno').value = p.ukupnoKartica || '';
    document.getElementById('p-honorar').value = p.honorarPoKartici || '';
    document.getElementById('p-start').value = p.datumPocetka || '';
    document.getElementById('p-rok').value = p.datumRoka || '';
    document.getElementById('p-cilj-dnevno').value = p.ciljDnevno || '';
    document.getElementById('p-vikend').value = p.radVikendom || 'ne';
    
    document.getElementById('p-naslovnica-base64').value = p.naslovnicaBase64 || '';
    document.getElementById('p-slova-original').value = p.slovaOriginal || 0;
    document.getElementById('p-slova-prijevod').value = p.slovaPrijevod || 0;

    const epubInput = document.getElementById('p-epub-file');
  if (epubInput) epubInput.value = '';

  // Prikaz naziva uvezanog EPUB-a
  const epubNameLabel = document.getElementById('p-epub-file-name');
  if (epubNameLabel) {
    if (p.epubBlob) {
      // Ako je File/Blob, dohvaćamo name svojstvo ili proizvoljni naziv
      const fileName = p.epubBlob.name || p.epubNazivDatoteke || "Učitani EPUB spremljen u bazi";
      epubNameLabel.innerHTML = `📄 Učitana datoteka: <strong>${fileName}</strong>`;
      epubNameLabel.style.color = '#2e7d32'; // Diskretna zelena boja za potvrdu
    } else {
      epubNameLabel.innerText = "Nije priložena EPUB datoteka.";
      epubNameLabel.style.color = '#777';
    }
  }
    
    if (document.getElementById('p-gdoc-url')) {
      document.getElementById('p-gdoc-url').value = p.gdocUrl || '';
    }
    document.getElementById('p-last-synced').value = p.lastSynced || '';

    const imgPreview = document.getElementById('img-cover-preview');
    const previewBox = document.getElementById('metrika-preview');
    if (p.naslovnicaBase64 && imgPreview) {
      imgPreview.src = p.naslovnicaBase64;
      imgPreview.style.display = 'block';
    }
    if (previewBox) previewBox.style.display = 'block';

    const formaNaslov = document.getElementById('forma-naslov');
    if (formaNaslov) formaNaslov.innerText = 'Edit Project';
    
    const formaContainer = document.getElementById('forma-projekt-container');
    if (formaContainer) {
      formaContainer.style.display = 'block';
      formaContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
}

function azurirajePrikazImenaEpuba(input) {
  const epubNameLabel = document.getElementById('p-epub-file-name');
  if (!epubNameLabel) return;

  if (input.files && input.files[0]) {
    const file = input.files[0];
    epubNameLabel.innerHTML = `📄 Odabrana nova datoteka: <strong>${file.name}</strong>`;
    epubNameLabel.style.color = '#1976d2'; // Plava boja za novi odabir
  }
}

async function obrisiProjekt(id) {
  if (!confirm('Are you sure you want to delete this project and all its entries?')) return;
  
  const db = await otvoriBazu();
  const tx = db.transaction(['projekti', 'unosi'], 'readwrite');
  tx.objectStore('projekti').delete(id);

  const unosiStore = tx.objectStore('unosi');
  const index = unosiStore.index('projektId');
  const req = index.openKeyCursor(IDBKeyRange.only(id));
  req.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      unosiStore.delete(cursor.primaryKey);
      cursor.continue();
    }
  };

  tx.oncomplete = () => ucitajDashboard();
}

function odaberiNacinUnosa(projektId, nacin) {
  const sekcijaScan = document.getElementById(`sekcija-skeniranje-${projektId}`);
  const sekcijaRucno = document.getElementById(`sekcija-rucno-${projektId}`);
  const tabScan = document.getElementById(`tab-scan-btn-${projektId}`);
  const tabManual = document.getElementById(`tab-manual-btn-${projektId}`);

  if (nacin === 'scan') {
    if (sekcijaScan) sekcijaScan.classList.remove('sakriveno');
    if (sekcijaRucno) sekcijaRucno.classList.add('sakriveno');
    if (tabScan) tabScan.classList.add('active');
    if (tabManual) tabManual.classList.remove('active');
  } else {
    if (sekcijaScan) sekcijaScan.classList.add('sakriveno');
    if (sekcijaRucno) sekcijaRucno.classList.remove('sakriveno');
    if (tabScan) tabScan.classList.remove('active');
    if (tabManual) tabManual.classList.add('active');
  }
}

async function povuciPodatkeIzIzvora() {
  const epubInput = document.getElementById('p-epub-file');
  const gdocInput = document.getElementById('p-gdoc-url');
  const statusMsg = document.getElementById('fetch-status-msg');

  const file = epubInput ? epubInput.files[0] : null;
  const gdocUrl = gdocInput ? gdocInput.value.trim() : "";

  if (!file && !gdocUrl) {
    alert("Please select an ePub file or enter a Google Docs URL.");
    return;
  }

  statusMsg.innerText = "Analyzing and fetching data...";
  statusMsg.style.display = 'block';

  let origSlova = parseInt(document.getElementById('p-slova-original').value) || 0;
  let docSlova = parseInt(document.getElementById('p-slova-prijevod').value) || 0;

  try {
    if (file) {
      statusMsg.innerText = "Reading ePub and counting characters...";
      const epubData = await parsirajEpub(file);
      
      if (epubData.title && !document.getElementById('p-naslov').value) {
        document.getElementById('p-naslov').value = epubData.title;
      }

      if (epubData.coverBase64) {
        document.getElementById('p-naslovnica-base64').value = epubData.coverBase64;
        const imgCover = document.getElementById('img-cover-preview');
        if (imgCover) {
          imgCover.src = epubData.coverBase64;
          imgCover.style.display = 'block';
        }
      }

      origSlova = epubData.charCount;
      document.getElementById('p-slova-original').value = origSlova;
      
      const karticaOrig = (origSlova / 1800).toFixed(2);
      document.getElementById('p-ukupno').value = karticaOrig;
    }

    if (gdocUrl) {
      statusMsg.innerText = "Dohvaćanje teksta s Google Docsa...";
      const tekstPrijevoda = await dohvatiCijeliTekstIzGDoca(gdocUrl);
      docSlova = tekstPrijevoda.length;
      document.getElementById('p-slova-prijevod').value = docSlova;
    }

    const lblOrigSlova = document.getElementById('lbl-slova-orig');
    const lblOrigKartice = document.getElementById('lbl-kartice-orig');
    const lblDocSlova = document.getElementById('lbl-slova-doc');
    const lblDocKartice = document.getElementById('lbl-kartice-doc');

    if (lblOrigSlova) lblOrigSlova.innerText = origSlova.toLocaleString();
    if (lblOrigKartice) lblOrigKartice.innerText = (origSlova / 1800).toFixed(2);

    if (lblDocSlova) lblDocSlova.innerText = docSlova.toLocaleString();
    if (lblDocKartice) lblDocKartice.innerText = (docSlova / 1800).toFixed(2);

    const metrikaPreview = document.getElementById('metrika-preview');
    if (metrikaPreview) metrikaPreview.style.display = 'block';

    statusMsg.innerText = "Data successfully fetched!";

  } catch (err) {
    alert("Error fetching data: " + err.message);
    statusMsg.innerText = "An error occurred.";
  }
}

async function parsirajEpub(file) {
  const zip = await JSZip.loadAsync(file);
  const parser = new DOMParser();

  let title = file.name.replace(/\.epub$/i, '');
  let coverBase64 = null;
  let totalChars = 0;

  let opfPath = '';
  const containerFile = zip.file("META-INF/container.xml");
  if (containerFile) {
    const xmlText = await containerFile.async("string");
    const doc = parser.parseFromString(xmlText, "text/xml");
    const root = doc.querySelector("rootfile");
    if (root) opfPath = root.getAttribute("full-path");
  }

  if (opfPath && zip.file(opfPath)) {
    const opfText = await zip.file(opfPath).async("string");
    const opfDoc = parser.parseFromString(opfText, "text/xml");

    const titleEl = opfDoc.querySelector("title") || opfDoc.querySelector("dc\\:title");
    if (titleEl && titleEl.textContent) title = titleEl.textContent.trim();

    let coverHref = null;
    const coverMeta = opfDoc.querySelector('meta[name="cover"]');
    if (coverMeta) {
      const coverId = coverMeta.getAttribute("content");
      const coverItem = opfDoc.querySelector(`item[id="${coverId}"]`);
      if (coverItem) coverHref = coverItem.getAttribute("href");
    }

    if (coverHref) {
      const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
      const fullCoverPath = opfDir + coverHref;
      const coverFile = zip.file(fullCoverPath) || zip.file(coverHref);
      if (coverFile) {
        const b64 = await coverFile.async("base64");
        const ext = coverHref.split('.').pop().toLowerCase();
        coverBase64 = `data:image/${ext === 'png' ? 'png' : 'jpeg'};base64,${b64}`;
      }
    }
  }

  for (const filename of Object.keys(zip.files)) {
    if (/\.(xhtml|html|htm)$/i.test(filename)) {
      const html = await zip.files[filename].async("string");
      const doc = parser.parseFromString(html, "text/html");
      const text = doc.body ? doc.body.textContent : "";
      totalChars += text.length;
    }
  }

  return { title, coverBase64, charCount: totalChars };
}

async function dohvatiSveProjekte() {
  try {
    const db = await otvoriBazu();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const rez = request.result || [];
        console.log(`Fetched ${rez.length} projects from IndexedDB.`);
        resolve(rez);
      };

      request.onerror = (event) => {
        console.error("Error fetching projects:", event.target.error);
        reject(event.target.error);
      };
    });
  } catch (err) {
    console.error("Error in dohvatiSveProjekte:", err);
    return [];
  }
}

async function dohvatiProjektPoId(id) {
  const projekti = await dohvatiSveProjekte();
  return projekti.find(p => p.id === id) || null;
}

async function obrisiProjektIzStoragea(id) {
  try {
    const db = await otvoriBazu();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);

      tx.oncomplete = () => {
        console.log("Project deleted from IndexedDB:", id);
        resolve(true);
      };
      tx.onerror = (event) => reject(event.target.error);
    });
  } catch (err) {
    console.error("Error deleting project:", err);
  }
}

async function azurirajProjektUStorage(projekt) {
  await spremiUStorage(projekt);
}

async function renderDashboard() {
  const container = document.getElementById('dashboard');
  if (!container) return;

  const projekti = await dohvatiSveProjekte();

  if (!projekti || projekti.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 40px 20px; color: #666;">
        <h3>No active projects</h3>
        <p>Click the "+ New Project" button at the top to add your first translation.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  projekti.forEach(projekt => {
    const cardHtml = kreirajHTMLKarticuProjekta(projekt);
    container.insertAdjacentHTML('beforeend', cardHtml);
  });
}

function kreirajHTMLKarticuProjekta(p) {
  const ukupnoKartica = parseFloat(p.ukupno) || 0;
  const odradjenoKartica = parseFloat(p.odradjeno) || 0;
  
  const postotak = ukupnoKartica > 0 
    ? Math.min(100, (odradjenoKartica / ukupnoKartica) * 100).toFixed(1) 
    : 0;

  const honorarPoKartici = parseFloat(p.honorar) || 0;
  const ukupnoEura = (ukupnoKartica * honorarPoKartici).toFixed(2);
  const zaradjenoEura = (odradjenoKartica * honorarPoKartici).toFixed(2);

  const ritamInfo = izracunajRitamIRok(p);

  const coverHtml = p.naslovnicaBase64 
    ? `<img src="${p.naslovnicaBase64}" alt="Cover" class="card-cover-img" />`
    : `<div class="card-cover-placeholder"><span>No<br>image</span></div>`;

  return `
    <div class="card project-card" id="project-card-${p.id}">
      <div class="card-header-layout">
        ${coverHtml}
        
        <div class="card-main-info">
          <div class="card-title-row">
            <div>
              <h3 class="project-title">${p.naslov || 'Untitled project'}</h3>
              ${p.klijent ? `<span class="project-client">🏢 ${p.klijent}</span>` : ''}
            </div>
            
            <div class="card-actions-dropdown">
              <button class="btn-icon" title="Edit" onclick="otvoriFormuZaUređivanje('${p.id}')">✏️</button>
              <button class="btn-icon" title="Delete" onclick="obrisiProjektIRerender('${p.id}')">🗑️</button>
            </div>
          </div>
        </div>
      </div>

      <div class="progress-section">
        <div class="progress-labels">
          <span>Completed: <strong>${odradjenoKartica.toFixed(2)}</strong> / ${ukupnoKartica.toFixed(2)} pages</span>
          <span><strong>${postotak}%</strong></span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${postotak}%;"></div>
        </div>
      </div>

      <div class="grid-2 card-stats-grid">
        <div class="stat-box">
          <small>Financial summary</small>
          <div><strong>€${zaradjenoEura}</strong> / €${ukupnoEura}</div>
        </div>

        <div class="stat-box">
          <small>Pace to deadline</small>
          <div><strong>${ritamInfo.potrebnoDnevno}</strong> pages/day (${ritamInfo.preostaloDana} d.)</div>
        </div>
      </div>
    </div>
  `;
}

function izracunajRitamIRok(p) {
  if (!p.rok) return { preostaloDana: 0, potrebnoDnevno: 0 };

  const danas = new Date();
  danas.setHours(0, 0, 0, 0);

  const rokDatum = new Date(p.rok);
  rokDatum.setHours(0, 0, 0, 0);

  const diffTime = rokDatum - danas;
  const ukupanBrojDana = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  let radniDani = ukupanBrojDana;

  if (p.vikend === 'ne') {
    radniDani = 0;
    let tempDate = new Date(danas);
    while (tempDate <= rokDatum) {
      const dayOfWeek = tempDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { 
        radniDani++;
      }
      tempDate.setDate(tempDate.getDate() + 1);
    }
    radniDani = Math.max(1, radniDani);
  }

  const preostaloKartica = Math.max(0, (parseFloat(p.ukupno) || 0) - (parseFloat(p.odradjeno) || 0));
  const potrebnoDnevno = (preostaloKartica / radniDani).toFixed(1);

  return {
    preostaloDana: radniDani,
    potrebnoDnevno: potrebnoDnevno
  };
}

async function obrisiProjektIRerender(id) {
  if (confirm("Are you sure you want to delete this project?")) {
    await obrisiProjektIzStoragea(id);
    await renderDashboard();
  }
}

function toggleFormaProjekta(forceClose = false) {
  const container = document.getElementById('forma-projekt-container');
  const btnNovi = document.getElementById('btn-novi-projekt');

  if (!container) return;

  const jeOtvoreno = container.style.display !== 'none' && container.style.display !== '';

  if (jeOtvoreno || forceClose) {
    container.style.display = 'none';
    if (btnNovi) btnNovi.innerText = '+ New Project';
    ocistiFormuProjekta();
  } else {
    ocistiFormuProjekta();
    container.style.display = 'block';
    if (btnNovi) btnNovi.innerText = '✕ Close Form';
    container.scrollIntoView({ behavior: 'smooth' });
  }
}

async function otvoriFormuZaUređivanje(id) {
  const p = await dohvatiProjektPoId(id);
  if (!p) return;

  const container = document.getElementById('forma-projekt-container');
  if (container) container.style.display = 'block';

  const btnNovi = document.getElementById('btn-novi-projekt');
  if (btnNovi) btnNovi.innerText = '✕ Close Form';

  document.getElementById('p-id').value = p.id || '';
  document.getElementById('p-naslov').value = p.naslov || '';
  document.getElementById('p-klijent').value = p.klijent || '';
  document.getElementById('p-ukupno').value = p.ukupno || '';
  document.getElementById('p-honorar').value = p.honorar || '';
  document.getElementById('p-start').value = p.start || '';
  document.getElementById('p-rok').value = p.rok || '';
  document.getElementById('p-cilj-dnevno').value = p.ciljDnevno || '';
  
  if (document.getElementById('p-vikend')) {
    document.getElementById('p-vikend').value = p.vikend || 'ne';
  }
  if (document.getElementById('p-slova-original')) {
    document.getElementById('p-slova-original').value = p.slovaOriginal || 0;
  }
  if (document.getElementById('p-slova-prijevod')) {
    document.getElementById('p-slova-prijevod').value = p.slovaPrijevod || 0;
  }
  if (document.getElementById('p-gdoc-url')) {
    document.getElementById('p-gdoc-url').value = p.gdocUrl || '';
  }
  if (document.getElementById('p-last-synced')) {
    document.getElementById('p-last-synced').value = p.lastSynced || '';
  }
  if (document.getElementById('p-naslovnica-base64')) {
    document.getElementById('p-naslovnica-base64').value = p.naslovnicaBase64 || '';
  }

  const imgCover = document.getElementById('img-cover-preview');
  if (imgCover) {
    if (p.naslovnicaBase64) {
      imgCover.src = p.naslovnicaBase64;
      imgCover.style.display = 'block';
    } else {
      imgCover.style.display = 'none';
      imgCover.src = '';
    }
  }

  const lblOrigSlova = document.getElementById('lbl-slova-orig');
  const lblDocSlova = document.getElementById('lbl-slova-doc');
  if (lblOrigSlova) lblOrigSlova.innerText = (p.slovaOriginal || 0).toLocaleString();
  if (lblDocSlova) lblDocSlova.innerText = (p.slovaPrijevod || 0).toLocaleString();

  const metrikaPreview = document.getElementById('metrika-preview');
  if (metrikaPreview) metrikaPreview.style.display = 'block';

  container.scrollIntoView({ behavior: 'smooth' });
}

function ocistiFormuProjekta() {
  const form = document.getElementById('form-projekt');
  if (form) form.reset();

  const idField = document.getElementById('p-id');
  if (idField) idField.value = '';

  const slovaOrig = document.getElementById('p-slova-original');
  if (slovaOrig) slovaOrig.value = '0';

  const slovaDoc = document.getElementById('p-slova-prijevod');
  if (slovaDoc) slovaDoc.value = '0';

  const gdocUrl = document.getElementById('p-gdoc-url');
  if (gdocUrl) gdocUrl.value = '';

  const base64Field = document.getElementById('p-naslovnica-base64');
  if (base64Field) base64Field.value = '';

  const lastSynced = document.getElementById('p-last-synced');
  if (lastSynced) lastSynced.value = '';

  const statusMsg = document.getElementById('fetch-status-msg');
  if (statusMsg) {
    statusMsg.innerText = '';
    statusMsg.style.display = 'none';
  }

  const imgCover = document.getElementById('img-cover-preview');
  if (imgCover) {
    imgCover.style.display = 'none';
    imgCover.src = '';
  }

  const metrikaPreview = document.getElementById('metrika-preview');
  if (metrikaPreview) metrikaPreview.style.display = 'none';
}

async function izveziSigurnosnuKopiju() {
  try {
    const db = await otvoriBazu();

    const txP = db.transaction(STORE_NAME, 'readonly');
    const projekti = await new Promise((res, rej) => {
      const req = txP.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    const txU = db.transaction(UNOSI_STORE, 'readonly');
    const unosi = await new Promise((res, rej) => {
      const req = txU.objectStore(UNOSI_STORE).getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    const backupData = {
      version: DB_VERSION,
      datum: new Date().toISOString(),
      projekti: projekti,
      unosi: unosi
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `mojih1500_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

  } catch (err) {
    console.error("Error exporting backup:", err);
    alert("Backup export failed.");
  }
}

async function uveziSigurnosnuKopiju(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);

      if (!data.projekti || !Array.isArray(data.projekti)) {
        throw new Error("File structure is invalid.");
      }

      const db = await otvoriBazu();

      const txP = db.transaction(STORE_NAME, 'readwrite');
      const storeP = txP.objectStore(STORE_NAME);
      for (const p of data.projekti) {
        storeP.put(p);
      }

      if (data.unosi && Array.isArray(data.unosi)) {
        const txU = db.transaction(UNOSI_STORE, 'readwrite');
        const storeU = txU.objectStore(UNOSI_STORE);
        for (const u of data.unosi) {
          storeU.put(u);
        }
      }

      alert("Backup successfully restored!");
      await ucitajDashboard();

    } catch (err) {
      console.error("Error importing backup:", err);
      alert("Failed to load backup. Ensure the file is valid JSON.");
    } finally {
      event.target.value = '';
    }
  };

  reader.readAsText(file);
}

async function rucniUnosZnakova(id) {
  try {
    const db = await otvoriBazu();
    
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const p = await new Promise((res, rej) => {
      const req = store.get(id);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    if (!p) return;

    const trenutnoSlova = p.slovaPrijevod || 0;
    const noviUnos = prompt(
      `Current character count (with spaces) for "${p.naslov}": ${trenutnoSlova.toLocaleString('en-US')}\n\nEnter new total character count:`,
      trenutnoSlova
    );

    if (noviUnos === null || noviUnos.trim() === '') return;

    const noviBrojSlova = parseInt(noviUnos.replace(/\s+/g, ''), 10);

    if (isNaN(noviBrojSlova) || noviBrojSlova < 0) {
      alert("Please enter a valid positive number!");
      return;
    }

    p.slovaPrijevod = noviBrojSlova;
    p.lastSynced = 'Manual (' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ')';

    await spremiUStorage(p);
    await ucitajDashboard();

  } catch (err) {
    console.error("Error updating manual entry:", err);
    alert("Could not update character count.");
  }
}

const SETTINGS_KEY = 'mojih1500_postavke';

function ucitajPostavke() {
  prikaziStranicu('settings-page');

  const postojacePostavke = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {
    modelDoprinosa: 'obrt',
    fiksniIznos: 0,
    postotakIznos: 0,
    vrstaKartice: '1800'
  };

  if (postojacePostavke.modelDoprinosa === 'postotak') {
    document.getElementById('model-postotak').checked = true;
  } else {
    document.getElementById('model-obrt').checked = true;
  }

  document.getElementById('fiksni-iznos').value = postojacePostavke.fiksniIznos || '';
  document.getElementById('postotak-iznos').value = postojacePostavke.postotakIznos || '';
  document.getElementById('kartica-1800').checked = true;

  osvjeziPrikazFinancija();
}

function osvjeziPrikazFinancija() {
  const isObrt = document.getElementById('model-obrt').checked;
  document.getElementById('polje-fiksni').style.display = isObrt ? 'block' : 'none';
  document.getElementById('polje-postotak').style.display = isObrt ? 'none' : 'block';
}

function spremiPostavke() {
  const modelDoprinosa = document.querySelector('input[name="modelDoprinosa"]:checked').value;
  const fiksniIznos = parseFloat(document.getElementById('fiksni-iznos').value) || 0;
  const postotakIznos = parseFloat(document.getElementById('postotak-iznos').value) || 0;
  const vrstaKartice = document.querySelector('input[name="vrstaKartice"]:checked').value;

  const postavke = {
    modelDoprinosa,
    fiksniIznos,
    postotakIznos,
    vrstaKartice
  };

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(postavke));
  alert('Settings saved successfully!');
}

let odabranaGodinaAnalitike = new Date().getFullYear();

async function ucitajAnalitiku() {
  prikaziStranicu('analytics-page');
  popuniGodineOdabira();
  await generirajTablicuAnalitike();
}

function popuniGodineOdabira() {
  const select = document.getElementById('odabir-godine');
  if (!select) return;
  select.innerHTML = '';
  
  const trenutnaGodina = new Date().getFullYear();
  for (let g = trenutnaGodina - 2; g <= trenutnaGodina + 2; g++) {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = `Year ${g}`;
    if (g === odabranaGodinaAnalitike) opt.selected = true;
    select.appendChild(opt);
  }
}

async function promijeniGodinuAnalitike() {
  odabranaGodinaAnalitike = parseInt(document.getElementById('odabir-godine').value);
  await generirajTablicuAnalitike();
}

async function generirajTablicuAnalitike() {
  const tbody = document.getElementById('analitika-tablica-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const sirovoPostavke = JSON.parse(localStorage.getItem('mojih1500_postavke')) || {};
  const postavke = {
    modelDoprinosa: sirovoPostavke.modelDoprinosa || 'obrt',
    fiksniIznos: parseFloat(sirovoPostavke.fiksniIznos) || 0,
    postotakIznos: parseFloat(sirovoPostavke.postotakIznos) || 0,
    vrstaKartice: parseInt(sirovoPostavke.vrstaKartice) || 1800
  };

  const sviProjekti = await dohvatiSveProjekte();

  const naziviMjeseci = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  let godisnjiNetoUkupno = 0;
  const danas = new Date();

  for (let m = 0; m < 12; m++) {
    const aktivniProjektiUMjesecu = [];

    sviProjekti.forEach(p => {
      const datumPocetka = p.datumPocetka ? new Date(p.datumPocetka) : new Date(p.datumKreiranja || Date.now());
      const datumRoka = new Date(p.datumRoka);

      const pocetakMjeseca = new Date(odabranaGodinaAnalitike, m, 1);
      const krajMjeseca = new Date(odabranaGodinaAnalitike, m + 1, 0);

      if (datumPocetka <= krajMjeseca && datumRoka >= pocetakMjeseca) {

        const jeZavrsetakProjekta = (datumRoka.getFullYear() === odabranaGodinaAnalitike && datumRoka.getMonth() === m);

        const norma = postavke.vrstaKartice || 1800;
        let ukupnoZnakovaOdradjeno = 0;

        const unosiDnevnika = p.dnevnik || p.logs || p.povijest || [];
        if (Array.isArray(unosiDnevnika) && unosiDnevnika.length > 0) {
          ukupnoZnakovaOdradjeno = unosiDnevnika.reduce((sum, u) => sum + (parseFloat(u.brojZnakova || u.znakova || u.iznos) || 0), 0);
        } else {
          ukupnoZnakovaOdradjeno = parseFloat(p.slovaPrijevod || p.slovaOriginal || p.odradjenoZnakova || p.trenutnoZnakova) || 0;
        }

        let odradjenoKartica = ukupnoZnakovaOdradjeno / norma;

        if (odradjenoKartica === 0) {
          odradjenoKartica = parseFloat(p.ukupnoKartica) || parseFloat(p.odradjenoKartica) || 0;
        }

        const cijenaPoKartici = parseFloat(p.honorarPoKartici || p.cijenaPoKartici || p.cijena) || 0;
        
        let trenutnoBruto = odradjenoKartica * cijenaPoKartici;
        if (trenutnoBruto === 0 && p.ukupnoBruto) {
          trenutnoBruto = parseFloat(p.ukupnoBruto) || 0;
        }

        let kasni = false;
        const ukupnoKartica = parseFloat(p.ukupnoKartica) || 0;
        if (datumRoka < danas && (ukupnoKartica === 0 || odradjenoKartica < ukupnoKartica)) {
          kasni = true;
        }

        const nazivKlijenta = p.klijent || p.izdavac || p.narucitelj || '-';

        aktivniProjektiUMjesecu.push({
          naslov: p.naslov || p.naziv || 'Unnamed project',
          izdavac: nazivKlijenta,
          bruto: trenutnoBruto,
          kasni: kasni,
          jeZavrsetakProjekta: jeZavrsetakProjekta
        });
      }
    });

    const imeMjeseca = naziviMjeseci[m];
    const zavrseniUOvomMjesecu = aktivniProjektiUMjesecu.filter(p => p.jeZavrsetakProjekta);
    const mjesecniBrutoZavrsenih = zavrseniUOvomMjesecu.reduce((sum, item) => sum + item.bruto, 0);

    let mjesecniNetoObrt = 0;
    if (postavke.modelDoprinosa === 'obrt') {
      if (zavrseniUOvomMjesecu.length > 0) {
        mjesecniNetoObrt = mjesecniBrutoZavrsenih - postavke.fiksniIznos;
      } else {
        mjesecniNetoObrt = 0;
      }
      godisnjiNetoUkupno += mjesecniNetoObrt;
    }

    if (aktivniProjektiUMjesecu.length === 0) {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #eee';
      tr.innerHTML = `
        <td style="padding: 10px 12px; font-weight: bold; color: #555;">${imeMjeseca}</td>
        <td style="padding: 10px 12px; color: #aaa;" colspan="2"><em>No active projects</em></td>
        <td style="padding: 10px 12px; text-align: right; color: #aaa;">€0.00</td>
        <td style="padding: 10px 12px; color: #aaa;">-</td>
      `;
      tbody.appendChild(tr);
    } else {
      aktivniProjektiUMjesecu.forEach((proj, idx) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #eee';

        const ukupnoRedovaUMjesecu = postavke.modelDoprinosa === 'obrt' 
          ? aktivniProjektiUMjesecu.length + 1 
          : aktivniProjektiUMjesecu.length;

        let tdMjesec = idx === 0 
          ? `<td rowspan="${ukupnoRedovaUMjesecu}" style="padding: 10px 12px; font-weight: bold; color: #333; vertical-align: top; background: #fafafa;">${imeMjeseca}</td>` 
          : '';

        let tdProjekt = `<td style="padding: 10px 12px; font-weight: 500;">${proj.naslov}</td>`;
        let tdIzdavac = `<td style="padding: 10px 12px; color: #666;">${proj.izdavac}</td>`;

        let tdNeto = '';

        if (postavke.modelDoprinosa === 'obrt') {
          if (proj.jeZavrsetakProjekta) {
            tdNeto = `<td style="padding: 10px 12px; text-align: right; font-weight: 500; color: #333;">
              €${proj.bruto.toFixed(2)}
            </td>`;
          } else {
            tdNeto = `<td style="padding: 10px 12px; text-align: right; color: #888; font-style: italic;">
              n/a
            </td>`;
          }
        } else {
          if (proj.jeZavrsetakProjekta) {
            const stopaDoprinosa = (postavke.postotakIznos || 0) / 100;
            const projNeto = proj.bruto * (1 - stopaDoprinosa);
            godisnjiNetoUkupno += projNeto;

            tdNeto = `<td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #2e7d32;">
              €${projNeto.toFixed(2)}
            </td>`;
          } else {
            tdNeto = `<td style="padding: 10px 12px; text-align: right; color: #888; font-style: italic;">
              n/a
            </td>`;
          }
        }

        let opaskaHtml = proj.kasni 
          ? `<span style="color: #c62828; font-weight: bold; background: #fde8e8; padding: 2px 6px; border-radius: 4px; font-size: 0.85em;">⚠️ Project delayed</span>`
          : `<span style="color: #2e7d32; font-size: 0.85em;">On schedule</span>`;

        let tdOpaska = `<td style="padding: 10px 12px;">${opaskaHtml}</td>`;

        tr.innerHTML = tdMjesec + tdProjekt + tdIzdavac + tdNeto + tdOpaska;
        tbody.appendChild(tr);
      });

      if (postavke.modelDoprinosa === 'obrt') {
        const trSuma = document.createElement('tr');
        trSuma.style.background = '#f9fbe7';
        trSuma.style.borderBottom = '2px solid #e0e0e0';

        const opisPrikaz = zavrseniUOvomMjesecu.length > 0 
          ? `<em>Total net for ${imeMjeseca} (after -€${postavke.fiksniIznos.toFixed(2)} contributions)</em>`
          : `<em>No projects completed this month</em>`;

        const iznosBoja = mjesecniNetoObrt >= 0 ? '#2e7d32' : '#c62828';
        const iznosPrikaz = zavrseniUOvomMjesecu.length > 0 ? `€${mjesecniNetoObrt.toFixed(2)}` : '€0.00';

        trSuma.innerHTML = `
          <td colspan="2" style="padding: 8px 12px; font-size: 0.88em; color: #555;">${opisPrikaz}</td>
          <td style="padding: 8px 12px; text-align: right; font-weight: bold; color: ${iznosBoja};">${iznosPrikaz}</td>
          <td style="padding: 8px 12px; font-size: 0.82em; color: #757575; font-style: italic;">Fixed monthly contributions applied</td>
        `;
        tbody.appendChild(trSuma);
      }
    }
  }

  const ukupnoEl = document.getElementById('analitika-ukupno-neto');
  if (ukupnoEl) {
    ukupnoEl.textContent = `€${godisnjiNetoUkupno.toFixed(2)}`;
  }
}

function toggleMenu() {
  const sideDrawer = document.getElementById('side-drawer');
  const overlay = document.getElementById('overlay');
  
  if (sideDrawer && overlay) {
    sideDrawer.classList.toggle('open');
    overlay.classList.toggle('active');
  }
}

function prikaziStranicu(pageId) {
  const sveStranice = document.querySelectorAll('.page-content');
  
  sveStranice.forEach(page => {
    page.style.display = 'none';
  });

  const trazenaStranica = document.getElementById(pageId);
  if (trazenaStranica) {
    trazenaStranica.style.display = 'block';
  }

  window.scrollTo(0, 0);
}

function prikaziDashboard() {
  prikaziStranicu('dashboard-page');
  ucitajDashboard();
}

/**
 * Prikazuje stranicu sa svim spremljenim analizama i pokreće učitavanje iz baze.
 */
async function prikaziSveAnalize() {
  if (typeof prikaziStranicu === 'function') {
    prikaziStranicu('analize-page');
  } else {
    const sveStranice = document.querySelectorAll('.page-content');
    sveStranice.forEach(p => p.style.display = 'none');
    const analizePage = document.getElementById('analize-page');
    if (analizePage) analizePage.style.display = 'block';
  }

  await ucitajListuAnaliza();
}

/**
 * Dohvaća sve zapise iz KONKORDANCA_STORE i povezuje ih s nazivima projekata iz STORE_NAME.
 */
async function ucitajListuAnaliza() {
  const container = document.getElementById('lista-analiza-container');
  if (!container) return;

  container.innerHTML = '<p class="text-muted">Učitavanje analiza...</p>';

  try {
    const db = await otvoriBazu();

    const txKonkordance = db.transaction(KONKORDANCA_STORE, 'readonly');
    const storeKonkordance = txKonkordance.objectStore(KONKORDANCA_STORE);
    const sveAnalize = await new Promise((res, rej) => {
      const req = storeKonkordance.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });

    if (sveAnalize.length === 0) {
      container.innerHTML = '<p class="text-muted">Trenutno nema spremljenih analiza. Pokrenite tekstualnu analizu s kartice projekta na dashboardu.</p>';
      return;
    }

    const txProjekti = db.transaction(STORE_NAME, 'readonly');
    const storeProjekti = txProjekti.objectStore(STORE_NAME);
    const sviProjekti = await new Promise((res, rej) => {
      const req = storeProjekti.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });

    const projektiMapa = new Map(sviProjekti.map(p => [p.id, p]));

    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    sveAnalize.forEach(analiza => {
      const projekt = projektiMapa.get(analiza.projektId);
      const naslovProjekta = projekt ? projekt.naslov : `Projekt ID: ${analiza.projektId}`;
      const klijent = projekt && projekt.klijent ? projekt.klijent : null;
      
      const datumAnalizeStr = analiza.datumAnalize 
        ? new Date(analiza.datumAnalize).toLocaleString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Nepoznat datum';

      const brojSegmenta = analiza.segmenti ? analiza.segmenti.length : 0;
      const brojKomentara = analiza.komentari ? analiza.komentari.length : 0;

      const card = document.createElement('div');
      card.className = 'card-analiza';
      card.style = 'background: #fff; border-radius: 8px; padding: 16px; border: 1px solid #eef2f2; box-shadow: 0 2px 6px rgba(0,0,0,0.06); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;';
      
      card.innerHTML = `
        <div>
          <h3 style="margin: 0 0 4px 0; color: #008080; font-size: 1.1em;">${naslovProjekta}</h3>
          ${klijent ? `<div style="font-size: 0.85em; color: #666; margin-bottom: 6px;">🏢 ${klijent}</div>` : ''}
          <div style="font-size: 0.85em; color: #777;">
            📅 Datum analize: <strong>${datumAnalizeStr}</strong> | 
            📄 Segmenta: <strong>${brojSegmenta}</strong> | 
            💡 Napomena: <strong>${brojKomentara}</strong>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button onclick="otvoriSpremljenuKonkordancu('${analiza.projektId}')" style="padding: 8px 14px; background: #008080; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.88em;">
            👁️ Otvori pregled
          </button>
          <button onclick="obrisiAnalizirano('${analiza.projektId}')" style="padding: 8px 12px; background: #fff; color: #c62828; border: 1px solid #c62828; border-radius: 4px; cursor: pointer; font-size: 0.88em;">
            🗑️ Obriši
          </button>
        </div>
      `;

      fragment.appendChild(card);
    });

    container.appendChild(fragment);

  } catch (err) {
    console.error("Greška pri učitavanju liste analiza:", err);
    container.innerHTML = '<p style="color: #c62828;">Došlo je do pogreške pri učitavanju analiza iz baze.</p>';
  }
}

async function otvoriSpremljenuKonkordancu(projektId) {
  const parsedId = isNaN(projektId) ? projektId : Number(projektId);
  await prikaziKonkordancu(parsedId);
}

async function obrisiAnalizirano(projektId) {
  if (!confirm("Jeste li sigurni da želite obrisati spremljenu analizu?")) return;

  try {
    const db = await otvoriBazu();
    const tx = db.transaction(KONKORDANCA_STORE, 'readwrite');
    const store = tx.objectStore(KONKORDANCA_STORE);
    
    store.delete(projektId);
    if (!isNaN(projektId)) store.delete(Number(projektId));

    tx.oncomplete = () => {
      ucitajListuAnaliza();
    };
  } catch (err) {
    console.error("Greška pri brisanju analize:", err);
  }
}

//funkcije za rad s glosarima

async function stvoriGlosar(izvorniTekst, prevedeniTekst, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

  const prompt = `
Analiziraj sljedeći izvorni tekst i njegov prijevod. 
Tvoj je zadatak izraditi detaljan rječnik/glosar ključnih pojmova, imena, fraza i specifične terminologije.

Za svaki pojam u izvorniku pronađi sve načine na koje je preveden u tekstu (uključujući sve alternativne prijevode ili varijacije za istu riječ).

Vrati isključivo validan JSON u sljedećem formatu bez dodatnog Markdown teksta ili objašnjenja:
{
  "terms": [
    {
      "source_term": "izvorna riječ ili fraza",
      "primary_translation": "glavni prijevod",
      "alternatives": [
        {
          "translation": "alternativni prijevod",
          "context": "kratak opis konteksta u kojem se koristi"
        }
      ],
      "has_inconsistency": true/false
    }
  ]
}

IZVORNI TEKST:
${izvorniTekst}

PREVEDENI TEKST:
${prevedeniTekst}
`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Greška pri izradi glosara: ${response.statusText}`);
  }

  const data = await response.json();
  const rawText = data.candidates[0].content.parts[0].text;
  return JSON.parse(rawText);
}

async function spremiGlosarUIndexedDB(idProjekta, glosarData) {
  const db = await otvoriBazu();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GLOSAR_STORE, "readwrite");
    const store = tx.objectStore(GLOSAR_STORE);
    
    const zapis = {
      id: idProjekta,
      glosar: glosarData,
      datum: new Date().toISOString()
    };
    
    const request = store.put(zapis);
    request.onsuccess = () => resolve(true);
    request.onerror = (event) => reject(event.target.error);
  });
}

async function dohvatiGlosarIzIndexedDB(idProjekta) {
  const db = await otvoriBazu();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GLOSAR_STORE, "readonly");
    const store = tx.objectStore(GLOSAR_STORE);
    const request = store.get(idProjekta);

    request.onsuccess = (event) => {
      resolve(event.target.result ? event.target.result.glosar : null);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Otvara modal i dohvaća glosar iz IndexedDB-a ili aktivne analize.
 */
async function otvoriModalGlosar(projektId) {
  const modal = document.getElementById('modal-glosar');
  const tbody = document.getElementById('glosar-modal-body');
  const porukaPrazno = document.getElementById('prazan-glosar-poruka');
  const tablica = document.getElementById('tablica-glosara');

  if (!modal || !tbody) return;

  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  tbody.innerHTML = '<tr><td colspan="2" class="text-center py-3">Učitavanje glosara...</td></tr>';
  porukaPrazno.style.display = 'none';
  tablica.style.display = 'table';
  prikaziModalSloj(modal);

  try {
    let rawGlosar = window.trenutniGlosar || window.glosar;

    if (!rawGlosar || Object.keys(rawGlosar).length === 0) {
    if (projektId) {
      rawGlosar = await dohvatiGlosarIzIndexedDB(projektId);
    }
  }

    tbody.innerHTML = '';

    // NORMALIACIJA STRUKTURE GLOSARA:
    // Rukuje slučajevima ako je glosar objekt s ključem 'terms', 'items', 'entries' ili obavezni niz/objekt
    let podaciZaPrikaz = [];

    if (rawGlosar) {
      if (Array.isArray(rawGlosar)) {
        podaciZaPrikaz = rawGlosar;
      } else if (typeof rawGlosar === 'object') {
        if (Array.isArray(rawGlosar.terms)) {
          podaciZaPrikaz = rawGlosar.terms;
        } else if (Array.isArray(rawGlosar.items)) {
          podaciZaPrikaz = rawGlosar.items;
        } else if (Array.isArray(rawGlosar.entries)) {
          podaciZaPrikaz = rawGlosar.entries;
        } else {
          // Standardni k/v objekt: { "term1": "prijevod1", "term2": "prijevod2" }
          podaciZaPrikaz = Object.entries(rawGlosar);
        }
      }
    }

    if (!podaciZaPrikaz || podaciZaPrikaz.length === 0) {
      porukaPrazno.style.display = 'block';
      tablica.style.display = 'none';
      return;
    }

    porukaPrazno.style.display = 'none';
    tablica.style.display = 'table';

// POPUNJAVANJE REDOVA TABLICE:
    podaciZaPrikaz.forEach((stavka) => {
      let izvorTekst = '';
      let prijevodTekst = '';

      if (Array.isArray(stavka)) {
        // Format [ "Izvor", "Prijevod" ] iz Object.entries()
        izvorTekst = stavka[0];
        prijevodTekst = stavka[1];
      } else if (typeof stavka === 'object' && stavka !== null) {
        // Dodani su ključevi koje vraća stvoriGlosar(): source_term i primary_translation
        izvorTekst = stavka.source_term || stavka.izvor || stavka.source || stavka.term || stavka.original || '';
        prijevodTekst = stavka.primary_translation || stavka.prijevod || stavka.target || stavka.translation || stavka.definition || '';
      }

      if (izvorTekst || prijevodTekst) {
        const tr = document.createElement('tr');
        
        const tdIzvor = document.createElement('td');
        tdIzvor.className = 'fw-bold';
        tdIzvor.textContent = izvorTekst;

        const tdPrijevod = document.createElement('td');
        tdPrijevod.textContent = prijevodTekst;

        tr.appendChild(tdIzvor);
        tr.appendChild(tdPrijevod);
        tbody.appendChild(tr);
      }
    });

  } catch (err) {
    console.error("Greška pri dohvatu/prikazu glosara:", err);
    tbody.innerHTML = '';
    porukaPrazno.textContent = "Greška pri učitavanju glosara.";
    porukaPrazno.style.display = 'block';
    tablica.style.display = 'none';
  }
}


/**
 * Pomoćna funkcija za dohvaćanje glosara iz IndexedDB baze
 */
async function dohvatiGlosarIzIndexedDB() {
  // Ako već imate u aplikaciji aktivni ID projekta/analize (npr. window.trenutniAnalizaId ili window.trenutniProjektId)
  const trenutniId = window.trenutniAnalizaId || window.trenutniProjektId;

  // Primjer pretpostavljene baze (prilagodite naziv vaše IndexedDB baze i objektnog spremnika)
  return new Promise((resolve, reject) => {
    // Ako imate postojeću funkciju ili DB instancu u aplikaciji, iskoristite je:
    if (typeof dohvatiProjektIzBaze === 'function' && trenutniId) {
      dohvatiProjektIzBaze(trenutniId)
        .then(projekt => resolve(projekt?.glosar || {}))
        .catch(reject);
      return;
    }

    // Izravan pristup IndexedDB-u ako nemate pomoćne funkcije
    const request = indexedDB.open('Mojih1500DB'); // Zamijenite točnim nazivom vaše baze

    request.onerror = () => reject('Neuspješno otvaranje IndexedDB baze');
    
    request.onsuccess = (e) => {
      const db = e.target.result;
      
      // Provjera postojanja store-a za glosar ili analize
      const storeName = db.objectStoreNames.contains('glosari') ? 'glosari' : 
                        (db.objectStoreNames.contains('analize') ? 'analize' : null);

      if (!storeName) {
        resolve({});
        return;
      }

      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);

      // Ako imamo ID dohvaćamo po ključu, u suprotnom uzimamo posljednji zapis
      if (trenutniId) {
        const getReq = store.get(trenutniId);
        getReq.onsuccess = () => resolve(getReq.result?.glosar || getReq.result || {});
        getReq.onerror = () => resolve({});
      } else {
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          const rezultati = getAllReq.result;
          if (rezultati && rezultati.length > 0) {
            const zadnji = rezultati[rezultati.length - 1];
            resolve(zadnji.glosar || zadnji);
          } else {
            resolve({});
          }
        };
        getAllReq.onerror = () => resolve({});
      }
    };
  });
}

/**
 * Prikazuje modalne slojeve (backdrop i stilove)
 */
function prikaziModalSloj(modal) {
  let backdrop = document.getElementById('glosar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'glosar-backdrop';
    backdrop.className = 'modal-backdrop fade show';
    document.body.appendChild(backdrop);
  }

  modal.style.display = 'block';
  modal.classList.add('show');
  document.body.classList.add('modal-open');
}


/**
 * Zatvara modalni prozor s glosarom.
 */
function zatvoriModalGlosar() {
  const modal = document.getElementById('modal-glosar');
  const backdrop = document.getElementById('glosar-backdrop');

  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
  }

  if (backdrop) {
    backdrop.remove();
  }

  document.body.classList.remove('modal-open');
}

// Zatvaranje modala na tipku ESC
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    zatvoriModalGlosar();
  }
});