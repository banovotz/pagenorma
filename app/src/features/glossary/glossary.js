// Glosar logika i komunikacija s IndexedDB-om

import { otvoriBazu, INTERLINEARNI_STORE } from '../../core/db.js';
import { parsirajLlmJson } from '../../utils/llmJson.js';
import { pricekajGeminiInterval } from '../../utils/geminiRateLimiter.js';

const GLOSAR_MAX_SEGMENTS_PER_REQUEST = 20;
const GLOSAR_MAX_CHARS_PER_REQUEST = 24000;

export async function dohvatiGlosarIzIndexedDB(projektId = null) {
  const trenutniId = projektId ?? window.trenutniAnalizaId ?? window.trenutniProjektId;
  if (trenutniId == null) return {};

  const db = await otvoriBazu();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INTERLINEARNI_STORE, 'readonly');
    const request = tx.objectStore(INTERLINEARNI_STORE).get(trenutniId);
    request.onsuccess = () => resolve(request.result?.glosar || {});
    request.onerror = () => reject(request.error);
  });
}

export async function dohvatiAnalizuIzIndexedDB(projektId = null) {
  const trenutniId = projektId ?? window.trenutniAnalizaId ?? window.trenutniProjektId;
  if (trenutniId == null) return null;

  const db = await otvoriBazu();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INTERLINEARNI_STORE, 'readonly');
    const request = tx.objectStore(INTERLINEARNI_STORE).get(trenutniId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}


export async function stvoriGlosar(izvorniTekst, prevedeniTekst, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  const prompt = `
Analiziraj sljedeći izvorni tekst i njegov prijevod. 
Tvoj je zadatak izraditi detaljan rječnik/glosar ključnih pojmova, imena, fraza i specifične terminologije.

Za svaki pojam u izvorniku pronađi sve načine na koje je preveden u tekstu (uključujući sve alternativne prijevode ili varijacije za istu riječ).
Ne ograničavaj rezultat na nekoliko najčešćih pojmova: uključi i vlastita imena,
geografske nazive, kulturne reference, fraze, idiome i specifične termine koji
se pojavljuju u ovom dijelu knjige.

Vrati isključivo validan JSON u sljedećem formatu bez dodatnog Markdown teksta ili objašnjenja:
{
  "terms": [
    {
      "source_term": "izvorna riječ ili fraza",
      "primary_translation": "glavni prijevod",
      "alternatives": [
        {
          "translation": "alternativni prijevod",
          "context": "kratak opis konteksta u kojem se koristi"
        }
      ],
      "has_inconsistency": true/false
    }
  ]
}

IZVORNI TEKST:
${izvorniTekst}

PREVEDENI TEKST:
${prevedeniTekst}
`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          terms: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                source_term: { type: "STRING" },
                primary_translation: { type: "STRING" },
                alternatives: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      translation: { type: "STRING" },
                      context: { type: "STRING" }
                    },
                    required: ["translation", "context"]
                  }
                },
                has_inconsistency: { type: "BOOLEAN" }
              },
              required: ["source_term", "primary_translation", "alternatives", "has_inconsistency"]
            }
          }
        },
        required: ["terms"]
      }
    }
  };

  let response;
  try {
    await pricekajGeminiInterval();
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message ||
      `Greška pri izradi glosara: HTTP ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Gemini nije vratio sadržaj glosara.');
  }

  const glosar = parsirajLlmJson(rawText, "Gemini glosar");
  if (!Array.isArray(glosar?.terms) || glosar.terms.length === 0) {
    throw new Error('Gemini je vratio prazan glosar.');
  }

  return glosar;
}

function napraviPaketeZaGlosar(segmenti) {
  const paketi = [];
  let paket = [];
  let brojZnakova = 0;

  for (const segment of segmenti) {
    const izvor = String(segment?.izvor || '').trim();
    const prijevod = String(segment?.prijevod || '').trim();
    if (!izvor || !prijevod) continue;

    const duljina = izvor.length + prijevod.length;
    if (
      paket.length > 0 &&
      (paket.length >= GLOSAR_MAX_SEGMENTS_PER_REQUEST ||
        brojZnakova + duljina > GLOSAR_MAX_CHARS_PER_REQUEST)
    ) {
      paketi.push(paket);
      paket = [];
      brojZnakova = 0;
    }

    paket.push({ izvor, prijevod });
    brojZnakova += duljina;
  }

  if (paket.length > 0) paketi.push(paket);
  return paketi;
}

function objediniGlosare(glosari) {
  const objedinjeni = new Map();

  for (const glosar of glosari) {
    for (const stavka of glosar?.terms || []) {
      const izvorniPojam = String(stavka?.source_term || '').trim();
      const glavniPrijevod = String(stavka?.primary_translation || '').trim();
      if (!izvorniPojam || !glavniPrijevod) continue;

      const kljuc = izvorniPojam.toLocaleLowerCase('hr');
      const postojeci = objedinjeni.get(kljuc);
      if (!postojeci) {
        objedinjeni.set(kljuc, {
          source_term: izvorniPojam,
          primary_translation: glavniPrijevod,
          alternatives: [],
          has_inconsistency: Boolean(stavka.has_inconsistency)
        });
        objedinjeni.get(kljuc).alternatives.push(...(stavka.alternatives || []));
        continue;
      }

      postojeci.has_inconsistency ||= Boolean(stavka.has_inconsistency);
      const prijevodi = new Set([
        postojeci.primary_translation.toLocaleLowerCase('hr'),
        ...postojeci.alternatives.map(alternativa =>
          String(alternativa?.translation || '').toLocaleLowerCase('hr')
        )
      ]);
      if (!prijevodi.has(glavniPrijevod.toLocaleLowerCase('hr'))) {
        postojeci.alternatives.push({
          translation: glavniPrijevod,
          context: 'Alternativni prijevod pronađen u drugom dijelu knjige.'
        });
      }
      for (const alternativa of stavka.alternatives || []) {
        const prijevod = String(alternativa?.translation || '').trim();
        if (!prijevod || prijevodi.has(prijevod.toLocaleLowerCase('hr'))) continue;
        postojeci.alternatives.push(alternativa);
        prijevodi.add(prijevod.toLocaleLowerCase('hr'));
      }
    }
  }

  return { terms: [...objedinjeni.values()] };
}

/**
 * Izrađuje glosar iz svih uparenih odlomaka knjige.
 * Obrada u paketima izbjegava ograničenje konteksta modela, a objedinjavanje
 * zadržava pojmove i alternativne prijevode pronađene u različitim paketima.
 */
export async function stvoriGlosarIzSegmenata(segmenti, apiKey, onProgress = null) {
  const paketi = napraviPaketeZaGlosar(segmenti);
  if (paketi.length === 0) {
    throw new Error('Nema uparenih odlomaka za izradu glosara.');
  }

  const glosari = [];
  const vrijemePocetka = performance.now();
  for (let index = 0; index < paketi.length; index += 1) {
    await pricekajGeminiInterval();
    const paket = paketi[index];
    const glosar = await stvoriGlosar(
      paket.map(stavka => stavka.izvor).join('\n\n'),
      paket.map(stavka => stavka.prijevod).join('\n\n'),
      apiKey
    );
    glosari.push(glosar);
    if (typeof onProgress === 'function') {
      const prosjecnoTrajanjePaketa = (performance.now() - vrijemePocetka) / (index + 1);
      onProgress({
        trenutniPaket: index + 1,
        ukupnoPaketa: paketi.length,
        procijenjenoUkupno: prosjecnoTrajanjePaketa * paketi.length,
        procijenjenoPreostalo: prosjecnoTrajanjePaketa * (paketi.length - index - 1)
      });
    }
  }

  return objediniGlosare(glosari);
}
