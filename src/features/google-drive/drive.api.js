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

//  Funkcija za Sinkronizaciju (Sync) Google Doc-a
export async function syncProjectDoc(projectId) {
  const project = getProjectById(projectId); 
  if (!project || !project.gdocUrl) {
    alert("Ovaj projekt nema postavljen Google Docs URL.");
    return;
  }

  try {
    // 1. Ponovno brojanje iz Google Doc-a
    const docData = await fetchGoogleDocCharCount(project.gdocUrl);

    // 2. Ažuriranje podataka projekta
    project.docCharCount = docData.docCharCount;
    project.docPages = docData.docPages;
    project.lastSyncedAt = new Date().toISOString(); // Obnavljanje datuma synca

    // 3. Spremanje u lokalnu bazu / IndexedDB / LocalStorage
    await saveProject(project);

    // 4. Ponovno rendersiranje kartice
    renderProjectCard(project);
    alert(`Sinkronizirano! Novi broj slova u prijevodu: ${docData.docCharCount.toLocaleString()} (${docData.docPages} kartica).`);

  } catch (err) {
    alert("Sinkronizacija nije uspjela: " + err.message);
  }
}

/**
 * Dohvaća broj znakova s razmacima iz javnog Google Doc-a.
 */
export async function fetchGoogleDocCharCount(docUrl) {
  const match = docUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error("Neispravan Google Docs URL.");
  }

  const docId = match[1];
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;

  const response = await fetch(exportUrl);
  if (!response.ok) {
    throw new Error("Dokument nije dostupan. Provjerite je li podijeljen kao 'Svatko s poveznicom' (Anyone with the link).");
  }

  const text = await response.text();
  const charCount = text.length;

  return {
    docCharCount: charCount,
    docPages: (charCount / 1800).toFixed(2)
  };
}