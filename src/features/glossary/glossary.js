// Glosar logika i komunikacija s IndexedDB-om

import { otvoriBazu, INTERLINEARNI_STORE } from '../../core/db.js';
import { parsirajLlmJson } from '../../utils/llmJson.js';

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

  const prompt = `
Analiziraj sljedeći izvorni tekst i njegov prijevod. 
Tvoj je zadatak izraditi detaljan rječnik/glosar ključnih pojmova, imena, fraza i specifične terminologije.

Za svaki pojam u izvorniku pronađi sve načine na koje je preveden u tekstu (uključujući sve alternativne prijevode ili varijacije za istu riječ).

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

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

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
