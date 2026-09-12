// Logika i manipulacija podatcima projekata

import { otvoriBazu, STORE_NAME, UNOSI_STORE, spremiUStorage } from '../../core/db.js';

export async function dohvatiSveProjekte() {
  try {
    const db = await otvoriBazu();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (event) => reject(event.target.error);
    });
  } catch (err) {
    console.error("Error in dohvatiSveProjekte:", err);
    return [];
  }
}

export async function dohvatiProjektPoId(id) {
  const projekti = await dohvatiSveProjekte();
  return projekti.find(p => p.id === id) || null;
}

export async function obrisiProjektIzStoragea(id) {
  try {
    const db = await otvoriBazu();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, UNOSI_STORE], 'readwrite');
      
      tx.objectStore(STORE_NAME).delete(id);

      const unosiStore = tx.objectStore(UNOSI_STORE);
      const index = unosiStore.index('projektId');
      const req = index.openKeyCursor(IDBKeyRange.only(id));
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          unosiStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = (event) => reject(event.target.error);
    });
  } catch (err) {
    console.error("Error deleting project:", err);
  }
}

export function izracunajPreostaleDane(datumRokaStr, radVikendom) {
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

export function izracunajRadneDane(pocetak, kraj, radVikendom) {
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

export async function rucniUnosZnakova(id, cbOsvjezi) {
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
    if (cbOsvjezi) await cbOsvjezi();

  } catch (err) {
    console.error("Error updating manual entry:", err);
    alert("Could not update character count.");
  }
}