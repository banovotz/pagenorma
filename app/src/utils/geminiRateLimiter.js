const GEMINI_MIN_REQUEST_INTERVAL_MS = 4200;

let zadnjiGeminiPoziv = 0;
let redGeminiPoziva = Promise.resolve();

function pricekaj(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function pricekajGeminiInterval() {
  const rezervacija = redGeminiPoziva.then(async () => {
    const preostalo = GEMINI_MIN_REQUEST_INTERVAL_MS - (Date.now() - zadnjiGeminiPoziv);
    if (preostalo > 0) await pricekaj(preostalo);
    zadnjiGeminiPoziv = Date.now();
  });

  redGeminiPoziva = rezervacija.catch(() => {});
  return rezervacija;
}
