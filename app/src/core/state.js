// Lokalno stanje, postavke i Gemini API ključ

const SETTINGS_KEY = 'mojih1500_postavke';

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

export function ucitajPostavke() {
  const postojacePostavke = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {
    modelDoprinosa: 'obrt',
    fiksniIznos: 0,
    postotakIznos: 0,
    vrstaKartice: '1800'
  };

  if (postojacePostavke.modelDoprinosa === 'postotak') {
    const el = document.getElementById('model-postotak');
    if (el) el.checked = true;
  } else {
    const el = document.getElementById('model-obrt');
    if (el) el.checked = true;
  }

  const fiksniEl = document.getElementById('fiksni-iznos');
  const postotakEl = document.getElementById('postotak-iznos');
  const karticaEl = document.getElementById('kartica-1800');

  if (fiksniEl) fiksniEl.value = postojacePostavke.fiksniIznos || '';
  if (postotakEl) postotakEl.value = postojacePostavke.postotakIznos || '';
  if (karticaEl) karticaEl.checked = true;

  osvjeziPrikazFinancija();
}

export function osvjeziPrikazFinancija() {
  const modelObrt = document.getElementById('model-obrt');
  const poljeFiksni = document.getElementById('polje-fiksni');
  const poljePostotak = document.getElementById('polje-postotak');

  if (!modelObrt || !poljeFiksni || !poljePostotak) return;

  const isObrt = modelObrt.checked;
  poljeFiksni.style.display = isObrt ? 'block' : 'none';
  poljePostotak.style.display = isObrt ? 'none' : 'block';
}

export function spremiPostavke() {
  const modelDoprinosa = document.querySelector('input[name="modelDoprinosa"]:checked')?.value || 'obrt';
  const fiksniIznos = parseFloat(document.getElementById('fiksni-iznos')?.value) || 0;
  const postotakIznos = parseFloat(document.getElementById('postotak-iznos')?.value) || 0;
  const vrstaKartice = document.querySelector('input[name="vrstaKartice"]:checked')?.value || '1800';

  const postavke = {
    modelDoprinosa,
    fiksniIznos,
    postotakIznos,
    vrstaKartice
  };

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(postavke));
  alert('Settings saved successfully!');
}