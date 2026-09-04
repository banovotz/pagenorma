// 1. ISPRVALJENI I POTPUNI IMPORTI
import { otvoriBazu } from './core/db.js';
import { dohvatiGeminiKluc } from './core/state.js';
import { prikaziStranicu } from './core/router.js';
import { inicijalizirajNavigaciju } from './ui/navigation.js'; 
import { dohvatiSveProjekte } from './features/projects/projects.js';
import './features/glossary/glossary.ui.js';

// Projekt & Dashboard
import { 
  ucitajDashboard, 
  spremiProjektForma, 
  toggleFormaProjekta, 
  azurirajePrikazImenaEpuba, 
  povuciPodatkeIzIzvora,
  izveziSigurnosnuKopiju, 
  uveziSigurnosnuKopiju 
} from './features/projects/projects.ui.js';

// Analize & Concordance
import { prikaziSveAnalize } from './features/concordance/concordance.ui.js';

// Postavke, Analitika i UI navigacija (prilagodite putanje prema vašoj strukturi mapa)
import { ucitajAnalitiku, osvjeziPrikazFinancija, promijeniGodinuAnalitike } from './features/analytics/analytics.ui.js';
import { ucitajPostavke, spremiGeminiKluc, spremiPostavke } from './features/settings/settings.ui.js';
import { toggleMenu, otvoriModalGlosar, zatvoriModalGlosar } from './ui/navigation.js';


let aplikacijaInicijalizirana = false;

// 1. Inicijalizacija navigacije
document.addEventListener('DOMContentLoaded', () => {
  // Obavezno pozovite inicijalizaciju navigacije!
  inicijalizirajNavigaciju(dohvatiSveProjekte);
  ucitajDashboard();

});

// 2. INICIJALIZACIJA APLIKACIJE
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

    postaviGlobalneEventListenere();
  } catch (err) {
    console.error("Error starting application:", err);
  }
}

// 3. CENTRALIZIRANI EVENT LISTENERI
function postaviGlobalneEventListenere() {

  // --- NAVIGACIJA I SIDE DRAWER ---
  const navLinks = document.querySelectorAll('.nav-links .nav-item, .drawer-menu .nav-item');
  
  navLinks.forEach(link => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const text = link.textContent.trim();

      if (text.includes('Dashboard')) {
        ucitajDashboard(); // Poziva ucitajDashboard umjesto prikaziDashboard
      } else if (text.includes('Financial Analytics')) {
        ucitajAnalitiku();
      } else if (text.includes('Tanslations Analytics')) {
        prikaziSveAnalize();   
      } else if (text.includes('Settings')) {
        ucitajPostavke();
      }

      if (link.closest('.side-drawer') && typeof toggleMenu === 'function') {
        toggleMenu();
      }
    });
  });

  const overlay = document.getElementById('overlay');
  if (overlay && typeof toggleMenu === 'function') {
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

  document.getElementById('btn-povuci-podatke')?.addEventListener('click', povuciPodatkeIzIzvora);

  const btnCancelProjekt = document.querySelector('#projekt-forma .btn-secondary');
  if (btnCancelProjekt) {
    btnCancelProjekt.addEventListener('click', () => toggleFormaProjekta(true));
  }

  // --- POSTAVKE (SETTINGS) ---
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
  const btnGlosar = document.querySelector('#concordance-page .btn-sync-small');
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

// 4. POKRETANJE
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