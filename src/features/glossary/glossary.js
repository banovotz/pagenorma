// Glosar logika i komunikacija s IndexedDB-om

import { otvoriBazu, GLOSAR_STORE } from '../../core/db.js';

export async function dohvatiGlosarIzIndexedDB(projektId) {
  try {
    const db = await otvoriBazu();
    return new Promise((resolve) => {
      const tx = db.transaction(GLOSAR_STORE, 'readonly');
      const store = tx.objectStore(GLOSAR_STORE);
      const req = store.get(projektId);
      req.onsuccess = () => resolve(req.result ? req.result.glosar : null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    console.error("Greška pri dohvaćanju glosara:", e);
    return null;
  }
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

export async function stvoriGlosar(izvorTekst, prijevodTekst, apiKey) {
  // Prolaz 1: Generiranje glosara terminologije
  return [
    { termin: "Example", prijevod: "Primjer", napomena: "Automatski generiran glosar" }
  ];
}