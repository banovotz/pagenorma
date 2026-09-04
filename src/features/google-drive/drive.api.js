// Integracija i dohvaćanje dokumenata s Google Docsa / Drivea

export async function dohvatiCijeliTekstIzGDoca(gdocUrl) {
  if (!gdocUrl || typeof gdocUrl !== 'string') return "";

  const match = gdocUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match || !match[1]) {
    throw new Error("Nevažeći Google Docs URL format.");
  }

  const docId = match[1];
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;

  try {
    const response = await fetch(exportUrl);
    if (!response.ok) {
      throw new Error(`Nije moguće dohvatiti Google Doc (Status: ${response.status}). Provjerite je li pristup postavljen na 'Svatko s vezom' (Anyone with the link).`);
    }
    const tekst = await response.text();
    return tekst;
  } catch (err) {
    console.error("Greška pri dohvaćanju Google Dokumenta:", err);
    throw new Error(`Greška pri dohvaćanju Google Doc-a: ${err.message}`);
  }
}