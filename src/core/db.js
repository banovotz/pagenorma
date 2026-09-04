// Baza podataka (IndexedDB) i postojanost pohrane

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(granted => {
    if (granted) {
      console.log("Data storage is persistent (persist enabled).");
    } else {
      console.warn("The browser may clear data if memory runs low.");
    }
  });
}

export const DB_NAME = 'Mojih1500DB';
export const DB_VERSION = 6;
export const STORE_NAME = 'projekti';
export const UNOSI_STORE = 'unosi';
export const KONKORDANCA_STORE = 'konkordance';
export const GLOSAR_STORE = 'glosari';

export function otvoriBazu() {
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

      if (!db.objectStoreNames.contains(KONKORDANCA_STORE)) {
        db.createObjectStore(KONKORDANCA_STORE, { keyPath: 'projektId' });
      }

      if (!db.objectStoreNames.contains(GLOSAR_STORE)) {
        db.createObjectStore(GLOSAR_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

export async function spremiUStorage(projekt) {
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