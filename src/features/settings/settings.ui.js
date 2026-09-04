/**
 * Modul za upravljanje korisničkim sučeljem i postavkama financija
 */

import { 
  osvjeziPrikazFinancija 
} from '../analytics/analytics.ui.js';

/**
 * Inicijalizira sve događaje (event listeners) na formi postavki.
 */
export function inicijalizirajSettingsUI(prikaziStranicuCallback) {
  const forma = document.getElementById('settings-form');
  const elObrt = document.getElementById('model-obrt');
  const elPostotak = document.getElementById('model-postotak');

  // Promjena modela doprinosa (obrt vs postotak) Dinamički prikazuje odgovarajuća polja
  if (elObrt) {
    elObrt.addEventListener('change', () => osvjeziPrikazFinancija());
  }

  if (elPostotak) {
    elPostotak.addEventListener('change', () => osvjeziPrikazFinancija());
  }

  // Spremanje postavki na submit forme
  if (forma) {
    forma.addEventListener('submit', (e) => {
      e.preventDefault();
      spremiPostavke();
    });
  }

  // Učitavanje početnih vrijednosti u formu
  ucitajPostavke(prikaziStranicuCallback);
}

/**
 * Pomoćna funkcija za dohvaćanje trenutno odabranih postavki iz forme.
 */
export function dohvatiVrijednostiIzForme() {
  const modelDoprinosa = document.querySelector('input[name="modelDoprinosa"]:checked')?.value || 'obrt';
  const fiksniIznos = parseFloat(document.getElementById('fiksni-iznos')?.value) || 0;
  const postotakIznos = parseFloat(document.getElementById('postotak-iznos')?.value) || 0;
  const vrstaKartice = document.querySelector('input[name="vrstaKartice"]:checked')?.value || '1800';

  return {
    modelDoprinosa,
    fiksniIznos,
    postotakIznos,
    vrstaKartice
  };
}

// --- UPRAVLJANJE GEMINI API KLJUČEM ---

export function spremiGeminiKluc() {
  const input = document.getElementById('gemini-api-key');
  if (!input || !input.value.trim()) {
    alert("Molimo unesite valjan Gemini API ključ.");
    return;
  }
  localStorage.setItem('gemini_api_key', input.value.trim());
  alert("Gemini API ključ je uspješno spremljen!");
}

export function dohvatiGeminiKluc() {
  return localStorage.getItem('gemini_api_key') || "";
}

//spremanje postavki

const SETTINGS_KEY = 'mojih1500_postavke';

export function ucitajPostavke() {
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


export function spremiPostavke() {
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
