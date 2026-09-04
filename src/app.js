import { otvoriBazu } from './core/db.js';
import { dohvatiGeminiKluc } from './core/state.js';
import { prikaziStranicu } from './core/router.js';
import { ucitajDashboard, spremiProjektForma, toggleFormaProjekta, azurirajePrikazImenaEpuba, izveziSigurnosnuKopiju, uveziSigurnosnuKopiju } from './features/projects/projects.ui.js';
import { prikaziSveAnalize } from './features/concordance/concordance.ui.js';



document.addEventListener('DOMContentLoaded', () => {

  // ==========================================
  // 1. NAVIGACIJA I SIDE DRAWER (Links)
  // ==========================================
  
  // Svi linkovi u glavnoj navigaciji i bočnom izborniku
  const navLinks = document.querySelectorAll('.nav-links .nav-item, .drawer-menu .nav-item');
  
  navLinks.forEach(link => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const text = link.textContent.trim();

      if (text.includes('Dashboard')) {
        prikaziDashboard();
      } else if (text.includes('Financial Analytics')) {
        ucitajAnalitiku();
      } else if (text.includes('Analytics') || text.includes('Tanslations Analytics')) {
        // Obrađuje "Analytics" iz bočnog izbornika i "Tanslations Analytics" iz glavne navigacije
        if (text.includes('Tanslations')) {
          prikaziSveAnalize();
        } else {
          ucitajAnalitiku();
        }
      } else if (text.includes('Settings')) {
        ucitajPostavke();
      }

      // Ako je kliknuto unutar bočnog izbornika, zatvori ga
      if (link.closest('.side-drawer')) {
        toggleMenu();
      }
    });
  });

  // Prekrivač (Overlay) za zatvaranje izbornika
  const overlay = document.getElementById('overlay');
  if (overlay) {
    overlay.addEventListener('click', toggleMenu);
  }

  // Eksterni linkovi (npr. Google AI Studio)
  const externalLinks = document.querySelectorAll('a[target="_blank"]');
  externalLinks.forEach(link => {
    link.addEventListener('click', (event) => {
      // Ovdje po potrebi možete dodati analitiku ili praćenje vanjskih klikova
      console.log(`Otvaranje vanjske poveznice: ${link.href}`);
    });
  });

  // ==========================================
  // 2. OBRASCI I GUMBI ZA PROJEKTE
  // ==========================================

  // Gumb "+ New Project"
  const btnNoviProjekt = document.getElementById('btn-novi-projekt');
  if (btnNoviProjekt) {
    btnNoviProjekt.addEventListener('click', toggleFormaProjekta);
  }

  // Forma projekta (Submit)
  const projektForma = document.getElementById('projekt-forma');
  if (projektForma) {
    projektForma.addEventListener('submit', (event) => {
      event.preventDefault();
      spremiProjektForma(event);
    });
  }

  // Odabir ePub datoteke (change event)
  const epubFileInput = document.getElementById('p-epub-file');
  if (epubFileInput) {
    epubFileInput.addEventListener('change', (event) => {
      azurirajePrikazImenaEpuba(event.target);
    });
  }

  // Gumb za povlačenje podataka iz izvora
  const btnPovuciPodatke = document.getElementById('btn-povuci-podatke');
  if (btnPovuciPodatke) {
    btnPovuciPodatke.addEventListener('click', povuciPodatkeIzIzvora);
  }

  // Gumb "Cancel" u formi projekta
  const btnCancelProjekt = document.querySelector('#projekt-forma .btn-secondary');
  if (btnCancelProjekt) {
    btnCancelProjekt.addEventListener('click', () => toggleFormaProjekta(true));
  }

  // ==========================================
  // 3. POSTAVKE (SETTINGS)
  // ==========================================

  // Radio gumbi za model doprinosa
  const modelObrt = document.getElementById('model-obrt');
  const modelPostotak = document.getElementById('model-postotak');
  
  if (modelObrt) modelObrt.addEventListener('change', osvjeziPrikazFinancija);
  if (modelPostotak) modelPostotak.addEventListener('change', osvjeziPrikazFinancija);

  // Gemini API Ključ - gumb za spremanje
  const btnSpremiGemini = document.querySelector('#settings-page button.btn-primary');
  if (btnSpremiGemini) {
    btnSpremiGemini.addEventListener('click', spremiGeminiKluc);
  }

  // Database Backup (Export / Import gumbi)
  const btnExport = document.querySelectorAll('#settings-page .settings-card')[3]?.querySelectorAll('button')[0];
  const btnImport = document.querySelectorAll('#settings-page .settings-card')[3]?.querySelectorAll('button')[1];

  if (btnExport) {
    btnExport.addEventListener('click', izveziSigurnosnuKopiju);
  }

  if (btnImport) {
    btnImport.addEventListener('click', () => {
      const fileInput = document.getElementById('import-file-input');
      if (fileInput) fileInput.click();
    });
  }

  // Glavni gumb "Save Settings" na dnu stranice
  const btnSpremiPostavke = document.querySelector('#settings-page > div[style*="text-align: right"] > button');
  if (btnSpremiPostavke) {
    btnSpremiPostavke.addEventListener('click', spremiPostavke);
  }

  // ==========================================
  // 4. ANALITIKA (ANALYTICS)
  // ==========================================

  const odabirGodine = document.getElementById('odabir-godine');
  if (odabirGodine) {
    odabirGodine.addEventListener('change', promijeniGodinuAnalitike);
  }

  // ==========================================
  // 5. MODALI I OSTALE AKCIJE
  // ==========================================

  // Otvaranje glosara
  const btnGlosar = document.querySelector('#concordance-page .btn-sync-small');
  if (btnGlosar) {
    btnGlosar.addEventListener('click', function() {
      otvoriModalGlosar(this);
    });
  }

  // Zatvaranje glosara
  const btnZatvoriGlosar = document.querySelector('#tablica-glosara .btn-sync-small');
  if (btnZatvoriGlosar) {
    btnZatvoriGlosar.addEventListener('click', zatvoriModalGlosar);
  }

});


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

    postaviGlobalneEventListenere();
  } catch (err) {
    console.error("Error starting application:", err);
  }
}

function postaviGlobalneEventListenere() {
  document.getElementById('form-projekt')?.addEventListener('submit', spremiProjektForma);
  document.getElementById('btn-novi-projekt')?.addEventListener('click', () => toggleFormaProjekta());
  
  const epubInput = document.getElementById('p-epub-file');
  if (epubInput) {
    epubInput.addEventListener('change', (e) => azurirajePrikazImenaEpuba(e.target));
  }

  document.getElementById('btn-export-backup')?.addEventListener('click', izveziSigurnosnuKopiju);
  document.getElementById('btn-import-backup')?.addEventListener('change', uveziSigurnosnuKopiju);
  document.getElementById('nav-analize')?.addEventListener('click', prikaziSveAnalize);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', pokreniAplikaciju);
} else {
  pokreniAplikaciju();
}