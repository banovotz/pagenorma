// A) Događaj pri odabiru ePub datoteke
document.getElementById('epub-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const loadingMsg = document.getElementById('epub-loading-msg');
  loadingMsg.style.display = 'block';

  try {
    const epubData = await parseEpubFile(file);
    
    // Automatsko popunjavanje forme
    document.getElementById('project-title').value = epubData.title;
    document.getElementById('project-cover-base64').value = epubData.coverDataUrl || '';
    
    // Prikaz u pregledu
    document.getElementById('preview-orig-chars').innerText = epubData.origCharCount.toLocaleString();
    document.getElementById('preview-orig-cards').innerText = epubData.origPages;

    // Spremanje u dataset radi kasnijeg spremanja projekta
    document.getElementById('project-form').dataset.origCharCount = epubData.origCharCount;

  } catch (err) {
    alert("Greška pri čitanju ePub datoteke: " + err.message);
  } finally {
    loadingMsg.style.display = 'none';
  }
});

// B) Funkcija za Sinkronizaciju (Sync) Google Doc-a
async function syncProjectDoc(projectId) {
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