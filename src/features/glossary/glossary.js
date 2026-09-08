// Glosar logika i komunikacija s IndexedDB-om

import { otvoriBazu, GLOSAR_STORE } from '../../core/db.js';

export async function dohvatiGlosarIzIndexedDB() {
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


export async function stvoriGlosar(izvorniTekst, prevedeniTekst, apiKey) {
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


export async function spremiGlosarUIndexedDB(projektId, glosar) {
  try {
    const db = await otvoriBazu();
    const tx = db.transaction(GLOSAR_STORE, 'readwrite');
    const store = tx.objectStore(GLOSAR_STORE);
    store.put({ id: projektId, glosar, datum: new Date().toISOString() });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("Greška pri spremanju glosara:", e);
  }
}


