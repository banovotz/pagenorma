// 1. IMPORTI
import { otvoriBazu } from './core/db.js';
import { dohvatiGeminiKluc } from './core/state.js';
import { registerRoutes, initRouter, toggleMenu, zatvoriModalGlosar } from './core/router.js';
import { dohvatiSveProjekte } from './features/projects/projects.js';
import {otvoriModalGlosar }from './features/glossary/glossary.ui.js';
import { azurirajePrikazImenaEpuba } from './features/epub-parser/epub.parser.js';

// Projekt & Dashboard
import {
  ucitajDashboard,
  spremiProjektForma,
  toggleFormaProjekta,
  povuciPodatkeIzIzvora,
  izveziSigurnosnuKopiju,
  uveziSigurnosnuKopiju
} from './features/projects/projects.ui.js';

// Analize / Interlinearni tekst
import { prikaziSveAnalize, prikaziInterlinearniTekst } from './features/interlinear/interlinear.ui.js';

// Postavke, Analitika i UI navigacija (prilagodite putanje prema vašoj strukturi mapa)
import { ucitajAnalitiku, osvjeziPrikazFinancija, promijeniGodinuAnalitike } from './features/analytics/analytics.ui.js';
import {
  ucitajPostavke,
  spremiGeminiKluc,
  spremiPostavke,
  autentificirajGoogleDriveIzPostavki,
  odjaviGoogleDriveIzPostavki
} from './features/settings/settings.ui.js';
import { initSubscriptionModule } from './features/subscription/subscription.js';

window.azurirajePrikazImenaEpuba = azurirajePrikazImenaEpuba;

let aplikacijaInicijalizirana = false;

// ----------------------------------------------------------------------------
// REGISTAR RUTA - jedino mjesto u aplikaciji koje definira koje ekrane
// aplikacija ima i što se učitava pri ulasku u svaki od njih. Router (vidi
// core/router.js) se brine za prikaz/sakrivanje DOM-a i za browser
// history/hash (gumb Natrag); ovdje se samo opisuje ŠTO gdje živi.
// ----------------------------------------------------------------------------
registerRoutes({
  'dashboard': {
    section: 'page-dashboard',
    view: 'dashboard-page',
    onEnter: () => ucitajDashboard()
  },
  'analytics': {
    section: 'page-analytics',
    view: 'analytics-page',
    onEnter: () => ucitajAnalitiku(dohvatiSveProjekte)
  },
  'translation-analytics': {
    section: 'page-translation-analytics',
    view: 'analize-page',
    onEnter: () => prikaziSveAnalize()
  },
  // Pod-ruta za pojedinu otvorenu analizu - ista sekcija kao gore, ali drugi
  // view i drugi onEnter. Omogućuje da URL (npr. #translation-analytics/interlinear/proj_123)
  // i gumb Natrag ispravno razlikuju "lista analiza" od "otvorena pojedina analiza".
  'translation-analytics/interlinear': {
    section: 'page-translation-analytics',
    view: 'interlinear-page',
    onEnter: (params) => {
      if (params && params.projektId) prikaziInterlinearniTekst(params.projektId);
    }
  },
  'settings': {
    section: 'page-settings',
    view: 'settings-page',
    onEnter: () => {
      ucitajPostavke();
      initSubscriptionModule();
    }
  },
  'settings/subscription': {
    section: 'page-settings',
    view: 'settings-page',
    onEnter: () => {
      ucitajPostavke();
      initSubscriptionModule();
      document.getElementById('subscription-page')?.scrollIntoView({ block: 'start' });
    }
  }
}, { defaultRoute: 'dashboard' });

// ----------------------------------------------------------------------------
// INICIJALIZACIJA APLIKACIJE (JEDINA točka ulaska)
// ----------------------------------------------------------------------------
async function pokreniAplikaciju() {
  if (aplikacijaInicijalizirana) return;
  aplikacijaInicijalizirana = true;

  try {
    await otvoriBazu();

    // initRouter sam postavlja početni prikaz (prema URL hashu ili zadanoj
    // ruti) i poziva pripadajući onEnter - nije potrebno posebno zvati
    // ucitajDashboard() ovdje, to radi 'dashboard' ruta.
    initRouter();

    const savedKey = dohvatiGeminiKluc();
    const input = document.getElementById('gemini-api-key');
    if (savedKey && input) {
      input.value = savedKey;
    }

    postaviGlobalneEventListenere();
  } catch (err) {
    console.error("Error starting application:", err);
  }
}

// ----------------------------------------------------------------------------
// CENTRALIZIRANI EVENT LISTENERI (ne uključuje navigaciju - to radi router.js
// preko delegiranog klika na [data-target], postavljenog unutar initRouter())
// ----------------------------------------------------------------------------
function postaviGlobalneEventListenere() {

  const overlay = document.getElementById('overlay');
  if (overlay) {
    overlay.addEventListener('click', toggleMenu);
  }

  // --- OBRASCI I GUMBI ZA PROJEKTE ---
  document.getElementById('btn-novi-projekt')?.addEventListener('click', () => toggleFormaProjekta());

  const projektForma = document.getElementById('projekt-forma');
  if (projektForma) {
    projektForma.addEventListener('submit', (e) => {
      e.preventDefault();
      spremiProjektForma(e);
    });
  }

  const epubInput = document.getElementById('p-epub-file');
  if (epubInput) {
    epubInput.addEventListener('change', (e) => azurirajePrikazImenaEpuba(e.target));
  }

  document.getElementById('tab-gdoc')?.addEventListener('click', () => prebaciIzvorPrijevoda('gdoc'));
  document.getElementById('tab-document-file')?.addEventListener('click', () => prebaciIzvorPrijevoda('file'));
  document.getElementById('p-translation-file')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    postaviDokumentPrijevoda(file);
    window.dispatchEvent(new CustomEvent('translation-file-selected', { detail: { file, handle: null } }));
  });
  document.getElementById('btn-choose-translation-file')?.addEventListener('click', odaberiDokumentPrijevoda);
  document.getElementById('btn-povuci-podatke')?.addEventListener('click', povuciPodatkeIzIzvora);

  const btnCancelProjekt = document.getElementById('btn-cancel-projekt');
  if (btnCancelProjekt) {
    btnCancelProjekt.addEventListener('click', () => toggleFormaProjekta(true));
  }

  function prebaciIzvorPrijevoda(source) {
    const isFile = source === 'file';
    document.getElementById('p-translation-source-mode').value = source;
    document.getElementById('translation-gdoc-panel').classList.toggle('sakriveno', isFile);
    document.getElementById('translation-file-panel').classList.toggle('sakriveno', !isFile);
    document.getElementById('tab-gdoc').classList.toggle('active', !isFile);
    document.getElementById('tab-document-file').classList.toggle('active', isFile);
    document.getElementById('tab-gdoc').setAttribute('aria-selected', String(!isFile));
    document.getElementById('tab-document-file').setAttribute('aria-selected', String(isFile));
  }

  function postaviDokumentPrijevoda(file) {
    if (!file) return;
    prebaciIzvorPrijevoda('file');
    const label = document.getElementById('p-translation-file-name');
    if (label) {
      label.textContent = `📄 Odabrana datoteka: ${file.name}`;
      label.style.color = '#1976d2';
    }
  }

  async function odaberiDokumentPrijevoda() {
    if (!window.showOpenFilePicker) {
      document.getElementById('p-translation-file')?.click();
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'Translation document', accept: {
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
          'application/rtf': ['.rtf'],
          'application/vnd.oasis.opendocument.text': ['.odt'],
          'text/plain': ['.txt']
        } }]
      });
      const file = await handle.getFile();
      const input = document.getElementById('p-translation-file');
      if (input) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
      }
      postaviDokumentPrijevoda(file);
      window.dispatchEvent(new CustomEvent('translation-file-selected', { detail: { file, handle } }));
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Odabir dokumenta nije uspio:', error);
        alert(`Odabir dokumenta nije uspio: ${error.message}`);
      }
    }
  }

  // --- POSTAVKE (SETTINGS) ---
  document.getElementById('btn-google-authenticate')?.addEventListener('click', autentificirajGoogleDriveIzPostavki);
  document.getElementById('btn-google-signout')?.addEventListener('click', odjaviGoogleDriveIzPostavki);
  document.getElementById('model-obrt')?.addEventListener('change', osvjeziPrikazFinancija);
  document.getElementById('model-postotak')?.addEventListener('change', osvjeziPrikazFinancija);

  const btnSpremiGemini = document.querySelector('#settings-page button.btn-primary');
  if (btnSpremiGemini) {
    btnSpremiGemini.addEventListener('click', spremiGeminiKluc);
  }

  document.getElementById('btn-export-backup')?.addEventListener('click', izveziSigurnosnuKopiju);
  document.getElementById('btn-import-backup')?.addEventListener('change', uveziSigurnosnuKopiju);

  const btnSpremiPostavke = document.querySelector('#settings-page > div[style*="text-align: right"] > button');
  if (btnSpremiPostavke) {
    btnSpremiPostavke.addEventListener('click', spremiPostavke);
  }

  // --- ANALITIKA ---
  document.getElementById('odabir-godine')?.addEventListener('change', promijeniGodinuAnalitike);

  // --- MODALI ---
  const btnGlosar = document.querySelector('#interlinear-page .btn-sync-small');
  if (btnGlosar) {
    btnGlosar.addEventListener('click', function() {
      otvoriModalGlosar(this);
    });
  }

  const btnZatvoriGlosar = document.querySelector('#tablica-glosara .btn-sync-small');
  if (btnZatvoriGlosar) {
    btnZatvoriGlosar.addEventListener('click', zatvoriModalGlosar);
  }
}

// ----------------------------------------------------------------------------
// POKRETANJE - jedna točka ulaska, bez obzira na trenutni document.readyState.
// (Ranije je inicijalizacija routera bila ugniježđena SAMO u
// 'DOMContentLoaded' grani, a budući da se ovaj modul učitava kao
// type="module" - što se ponaša kao "defer" - readyState u trenutku
// izvođenja ovog koda gotovo nikad nije 'loading', pa se router u praksi
// gotovo nikad nije inicijalizirao.)
// ----------------------------------------------------------------------------
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', pokreniAplikaciju);
} else {
  pokreniAplikaciju();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker uspješno registriran za scope:', reg.scope))
      .catch(err => console.error('Greška pri registraciji Service Workera:', err));
  });
}
