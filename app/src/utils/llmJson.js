function pronadiKrajJsonVrijednosti(tekst, pocetak) {
  const otvaranja = { '{': '}', '[': ']' };
  const zatvaranja = new Set(Object.values(otvaranja));
  const stog = [];
  let uStringu = false;
  let escape = false;

  for (let i = pocetak; i < tekst.length; i++) {
    const znak = tekst[i];

    if (uStringu) {
      if (escape) {
        escape = false;
      } else if (znak === '\\') {
        escape = true;
      } else if (znak === '"') {
        uStringu = false;
      }
      continue;
    }

    if (znak === '"') {
      uStringu = true;
    } else if (otvaranja[znak]) {
      stog.push(otvaranja[znak]);
    } else if (zatvaranja.has(znak)) {
      if (stog.pop() !== znak) return null;
      if (stog.length === 0) return tekst.slice(pocetak, i + 1);
    }
  }

  return null;
}

export function parsirajLlmJson(rawText, opis = 'LLM odgovor') {
  if (typeof rawText !== 'string' || rawText.trim() === '') {
    throw new Error(`${opis} je prazan.`);
  }

  const bezMarkdownOmota = rawText
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  try {
    return JSON.parse(bezMarkdownOmota);
  } catch (prvaGreska) {
    const pocetak = bezMarkdownOmota.search(/[\[{]/);
    if (pocetak === -1) {
      throw new Error(`${opis} nije valjan JSON: ${prvaGreska.message}`);
    }

    const jsonTekst = pronadiKrajJsonVrijednosti(bezMarkdownOmota, pocetak);
    if (!jsonTekst) {
      throw new Error(`${opis} nije valjan JSON: ${prvaGreska.message}`);
    }

    try {
      return JSON.parse(jsonTekst);
    } catch (greska) {
      throw new Error(`${opis} nije valjan JSON: ${greska.message}`);
    }
  }
}

export function porukaGreske(err, zadanaPoruka = 'Nepoznata greška') {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return zadanaPoruka;
}
