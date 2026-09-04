import { otvoriBazu } from './core/db.js';
import { dohvatiGeminiKluc } from './core/state.js';
import { prikaziStranicu } from './core/router.js';
import { ucitajDashboard, spremiProjektForma, toggleFormaProjekta, azurirajePrikazImenaEpuba, izveziSigurnosnuKopiju, uveziSigurnosnuKopiju } from './features/projects/projects.ui.js';
import { prikaziSveAnalize } from './features/concordance/concordance.ui.js';

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