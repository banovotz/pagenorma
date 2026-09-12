/**
 * Modul za upravljanje korisničkim sučeljem i postavkama financija
 */

import { 
  osvjeziPrikazFinancija 
} from '../analytics/analytics.ui.js';

import {
  forceGoogleDriveAuthentication,
  odjaviGDrive
} from '../google-drive/drive.auth.js';


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

export async function autentificirajGoogleDriveIzPostavki() {
  const status = document.getElementById('google-auth-status');
  if (status) {
    status.textContent = 'Opening Google authentication...';
    status.style.color = '#666';
  }

  try {
    await forceGoogleDriveAuthentication();
    if (status) {
      status.textContent = 'Google Drive authenticated. You can now import private Docs.';
      status.style.color = '#2e7d32';
    }
  } catch (error) {
    console.error('Google Drive authentication failed:', error);
    if (status) {
      status.textContent = error.message;
      status.style.color = '#c62828';
    }
  }
}

export function odjaviGoogleDriveIzPostavki() {
  odjaviGDrive();
  const status = document.getElementById('google-auth-status');
  if (status) {
    status.textContent = 'Google Drive authentication removed.';
    status.style.color = '#666';
  }
}


