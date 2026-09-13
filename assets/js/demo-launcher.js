// ============================================================================
// DEMO PROJECT LAUNCHER (landing page)
// ============================================================================
// Pokreće se klikom na hero CTA "Start With Demo Project". Provjerava postoji
// li već postojeći IndexedDB unutar preglednika (ista shema koju koristi
// aplikacija u /app/src/core/db.js) i, ovisno o stanju, ili automatski uvozi
// demo projekt pa korisnika prebacuje na dashboard, ili traži potvrdu ako bi
// uvoz prepisao postojeće podatke korisnika.
// ============================================================================

(function () {
  const DB_NAME = 'pagenormaDB';
  const DB_VERSION = 8;
  const STORE_NAME = 'projekti';
  const UNOSI_STORE = 'unosi';
  const INTERLINEARNI_STORE = 'interlinearnitekst';
  const DEMO_DATA_URL = '/app/public/demo-project.json';
  const APP_URL = '/app/';
  const REDIRECT_DELAY_MS = 1800;

  function otvoriBazu() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // Shema mora ostati identična onoj u app/src/core/db.js kako bi oba
      // mjesta (landing i app) dijelila istu bazu bez konflikta verzija.
      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(UNOSI_STORE)) {
          const unosiStore = db.createObjectStore(UNOSI_STORE, { keyPath: 'id' });
          unosiStore.createIndex('projektId', 'projektId', { unique: false });
        }

        if (!db.objectStoreNames.contains(INTERLINEARNI_STORE)) {
          db.createObjectStore(INTERLINEARNI_STORE, { keyPath: 'projektId' });
        }
      };

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  function imaPostojecihProjekata(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = () => reject(req.error);
    });
  }

  async function dohvatiDemoPodatke() {
    const response = await fetch(DEMO_DATA_URL);
    if (!response.ok) throw new Error('Demo datoteka nije dostupna.');
    return response.json();
  }

  function uveziDemoPodatke(db, demoJson, { obrisiPostojece } = {}) {
    return new Promise((resolve, reject) => {
      const stores = demoJson.stores || {};
      const storeNames = Object.keys(stores).filter(name => db.objectStoreNames.contains(name));

      if (storeNames.length === 0) {
        reject(new Error('Demo datoteka ne sadrži poznate podatkovne skupove.'));
        return;
      }

      const tx = db.transaction(storeNames, 'readwrite');

      for (const storeName of storeNames) {
        const store = tx.objectStore(storeName);
        if (obrisiPostojece) store.clear();
        for (const record of stores[storeName] || []) {
          store.put(record);
        }
      }

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Uvoz demo projekta je prekinut.'));
    });
  }

  // --------------------------------------------------------------------------
  // Modal - markup, prikaz stanja i akcije
  // --------------------------------------------------------------------------

  function kreirajModalMarkup() {
    const overlay = document.createElement('div');
    overlay.id = 'demo-launcher-overlay';
    overlay.className = 'demo-modal-overlay';
    overlay.innerHTML = `
      <div class="demo-modal" role="dialog" aria-modal="true" aria-labelledby="demo-modal-title">
        <div class="demo-modal-icon" id="demo-modal-icon">
          <div class="demo-spinner"></div>
        </div>
        <h2 id="demo-modal-title" class="demo-modal-title">Creating your demo project…</h2>
        <p class="demo-modal-text" id="demo-modal-text">
          We're setting up a fully populated sample project so you can explore pagenorma
          right away — glossary, interlinear text and progress tracking included.
        </p>
        <div class="demo-modal-actions" id="demo-modal-actions" style="display: none;"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function prikaziStanje(overlay, { icon, title, text, actions, showSpinner } = {}) {
    const iconEl = overlay.querySelector('#demo-modal-icon');
    const titleEl = overlay.querySelector('#demo-modal-title');
    const textEl = overlay.querySelector('#demo-modal-text');
    const actionsEl = overlay.querySelector('#demo-modal-actions');

    if (icon !== undefined) iconEl.innerHTML = icon;
    else if (showSpinner) iconEl.innerHTML = '<div class="demo-spinner"></div>';

    if (title !== undefined) titleEl.textContent = title;
    if (text !== undefined) textEl.innerHTML = text;

    actionsEl.innerHTML = '';
    if (actions && actions.length) {
      actions.forEach(({ label, className, onClick }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = className || 'demo-btn-secondary';
        btn.textContent = label;
        btn.addEventListener('click', onClick);
        actionsEl.appendChild(btn);
      });
      actionsEl.style.display = 'flex';
    } else {
      actionsEl.style.display = 'none';
    }
  }

  function zatvoriModal(overlay) {
    overlay.classList.remove('demo-modal-visible');
    setTimeout(() => overlay.remove(), 200);
  }

  function idiNaAplikaciju() {
    window.location.href = APP_URL;
  }

  async function pokreniAutomatskiUvoz(overlay, db) {
    prikaziStanje(overlay, {
      title: 'Creating your demo project…',
      text: 'We\'re setting up a fully populated sample project so you can explore pagenorma right away — glossary, interlinear text and progress tracking included.',
      showSpinner: true
    });

    try {
      const demoJson = await dohvatiDemoPodatke();
      await uveziDemoPodatke(db, demoJson, { obrisiPostojece: false });

      prikaziStanje(overlay, {
        icon: '<div class="demo-icon-success">✓</div>',
        title: 'Demo project ready!',
        text: 'Taking you to your dashboard…'
      });

      setTimeout(idiNaAplikaciju, REDIRECT_DELAY_MS);
    } catch (err) {
      console.error('Error creating demo project:', err);
      prikaziStanje(overlay, {
        icon: '<div class="demo-icon-error">!</div>',
        title: 'Something went wrong',
        text: 'We couldn\'t create the demo project. You can still open the app and start with a blank workspace.',
        actions: [
          {
            label: 'Open the app',
            className: 'demo-btn-primary',
            onClick: idiNaAplikaciju
          },
          {
            label: 'Close',
            className: 'demo-btn-cancel',
            onClick: () => zatvoriModal(overlay)
          }
        ]
      });
    }
  }

  function prikaziUpozorenjePostojecihPodataka(overlay, db) {
    prikaziStanje(overlay, {
      icon: '<div class="demo-icon-warning">⚠</div>',
      title: 'You already have a project',
      text: 'It looks like you already have translation project data saved in this browser. Loading the demo project will not touch your data unless you explicitly choose to overwrite it.',
      actions: [
        {
          label: 'Open my project',
          className: 'demo-btn-primary',
          onClick: idiNaAplikaciju
        },
        {
          label: 'Overwrite with demo project',
          className: 'demo-btn-danger',
          onClick: () => prikaziPotvrduPrepisivanja(overlay, db)
        },
        {
          label: 'Cancel',
          className: 'demo-btn-cancel',
          onClick: () => zatvoriModal(overlay)
        }
      ]
    });
  }

  function prikaziPotvrduPrepisivanja(overlay, db) {
    prikaziStanje(overlay, {
      icon: '<div class="demo-icon-warning">⚠</div>',
      title: 'Are you sure?',
      text: 'This will <strong>permanently delete</strong> all your existing projects, entries and glossary data, replacing them with the demo project. This action cannot be undone.',
      actions: [
        {
          label: 'Yes, overwrite everything',
          className: 'demo-btn-danger',
          onClick: async () => {
            prikaziStanje(overlay, {
              icon: '<div class="demo-spinner"></div>',
              title: 'Replacing your data…',
              text: 'Please wait while we load the demo project.',
              actions: []
            });
            try {
              const demoJson = await dohvatiDemoPodatke();
              await uveziDemoPodatke(db, demoJson, { obrisiPostojece: true });
              prikaziStanje(overlay, {
                icon: '<div class="demo-icon-success">✓</div>',
                title: 'Demo project ready!',
                text: 'Taking you to your dashboard…'
              });
              setTimeout(idiNaAplikaciju, REDIRECT_DELAY_MS);
            } catch (err) {
              console.error('Error overwriting data with demo project:', err);
              prikaziStanje(overlay, {
                icon: '<div class="demo-icon-error">!</div>',
                title: 'Something went wrong',
                text: 'We couldn\'t load the demo project and your existing data was not modified.',
                actions: [
                  { label: 'Open the app', className: 'demo-btn-primary', onClick: idiNaAplikaciju },
                  { label: 'Close', className: 'demo-btn-cancel', onClick: () => zatvoriModal(overlay) }
                ]
              });
            }
          }
        },
        {
          label: 'No, go back',
          className: 'demo-btn-cancel',
          onClick: () => prikaziUpozorenjePostojecihPodataka(overlay, db)
        }
      ]
    });
  }

  async function pokreniDemoTok() {
    const overlay = kreirajModalMarkup();
    requestAnimationFrame(() => overlay.classList.add('demo-modal-visible'));

    try {
      const db = await otvoriBazu();
      const postoji = await imaPostojecihProjekata(db);

      if (postoji) {
        prikaziUpozorenjePostojecihPodataka(overlay, db);
      } else {
        await pokreniAutomatskiUvoz(overlay, db);
      }
    } catch (err) {
      console.error('Error preparing demo project:', err);
      prikaziStanje(overlay, {
        icon: '<div class="demo-icon-error">!</div>',
        title: 'Something went wrong',
        text: 'We couldn\'t access your browser storage. You can still open the app.',
        actions: [
          { label: 'Open the app', className: 'demo-btn-primary', onClick: idiNaAplikaciju },
          { label: 'Close', className: 'demo-btn-cancel', onClick: () => zatvoriModal(overlay) }
        ]
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-launch-demo');
    if (!btn) return;
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      pokreniDemoTok();
    });
  });
})();
