// Renderiranje sučelja projekata i kontrola formi

import { otvoriBazu, STORE_NAME, UNOSI_STORE, spremiUStorage } from '../../core/db.js';
import { dohvatiSveProjekte, dohvatiProjektPoId, obrisiProjektIzStoragea, izracunajPreostaleDane, rucniUnosZnakova } from './projects.js';
import { pokreniTekstualnuAnalizu } from '../concordance/concordance.js';
import { parseEpubFile } from '../epub-parser/epub.parser.js';
import { dohvatiCijeliTekstIzEpuba } from '../concordance/concordance.js';
import { dohvatiCijeliTekstIzGDoca } from '../google-drive/drive.api.js';
export async function ucitajDashboard() {
  const dashboardDiv = document.getElementById('dashboard-page');
  if (!dashboardDiv) return;

  dashboardDiv.innerHTML = '';

  try {
    const db = await otvoriBazu();
    
    const txProjekti = db.transaction(STORE_NAME, 'readonly');
    const storeProjekti = txProjekti.objectStore(STORE_NAME);
    const projekti = await new Promise((res, rej) => {
      const req = storeProjekti.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    if (!projekti || projekti.length === 0) {
      dashboardDiv.innerHTML = '<p class="text-muted" style="text-align:center; padding: 20px;">You currently have no active projects. Click on "+ New Project".</p>';
      return;
    }

    const txUnosi = db.transaction(UNOSI_STORE, 'readonly');
    const storeUnosi = txUnosi.objectStore(UNOSI_STORE);
    const sviUnosi = await new Promise((res, rej) => {
      const req = storeUnosi.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    const fragment = document.createDocumentFragment();

    projekti.forEach(p => {
      const unosiProjekta = sviUnosi.filter(u => u.projektId === p.id);
      const rucnoKartica = unosiProjekta.reduce((sum, u) => sum + (parseFloat(u.kartica) || 0), 0);
      
      const odradjenoKartica = ((p.slovaPrijevod || 0) / 1800) + rucnoKartica;
      const ukupnoKartica = parseFloat(p.ukupnoKartica) || 0;
      const preostaloKartica = Math.max(0, ukupnoKartica - odradjenoKartica);
      const postotak = ukupnoKartica > 0 ? Math.min(100, Math.round((odradjenoKartica / ukupnoKartica) * 100)) : 0;

      const preostaloDana = izracunajPreostaleDane(p.datumRoka, p.radVikendom);
      const planiranoDnevno = parseFloat(p.ciljDnevno) || 0;
      let dnevniRitamText = '';

      if (postotak >= 100) {
        dnevniRitamText = `<span style="color: #2e7d32; font-weight: bold;">🎉 Project completed!</span>`;
      } else if (preostaloDana <= 0) {
        dnevniRitamText = `<span style="color: #c62828; font-weight: bold;">⚠️ Deadline has passed!</span>`;
      } else {
        const potrebnoDnevnoNum = preostaloKartica / preostaloDana;
        const potrebnoDnevno = (preostaloKartica / preostaloDana).toFixed(2);
        const vikendOpaska = p.radVikendom === 'da' ? 'days (including weekends)' : 'business days';

        const jeUZaostatku = planiranoDnevno > 0 && potrebnoDnevnoNum > planiranoDnevno;
        const markBojaPozadine = jeUZaostatku ? '#fde8e8' : '#e6f2f2';
        const markBojaTeksta = jeUZaostatku ? '#c62828' : '#008080';
        
        dnevniRitamText = `
          <div><strong>Planned pace:</strong> ${planiranoDnevno > 0 ? `${planiranoDnevno} pages/day` : '<span class="text-muted">Not set</span>'}</div>
          <div style="margin-top: 2px;">
            <strong>Required pace:</strong> 
            <mark style="background: ${markBojaPozadine}; color: ${markBojaTeksta}; padding: 2px 6px; border-radius: 4px; font-weight: bold;">
              ${potrebnoDnevno} pages/day
            </mark> 
            <small class="text-muted">(${preostaloDana} ${vikendOpaska} until deadline)</small>
          </div>
        `;
      }

      const honorarPoKartici = parseFloat(p.honorarPoKartici) || 0;
      const ukupniHonorar = (ukupnoKartica * honorarPoKartici).toFixed(2);
      const zaradjenoDoSada = (odradjenoKartica * honorarPoKartici).toFixed(2);

      const naslovnicaHtml = p.naslovnicaBase64 
        ? `<img src="${p.naslovnicaBase64}" alt="Cover" style="width: 75px; height: 110px; object-fit: cover; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.15); flex-shrink: 0;">`
        : `<div style="width: 75px; height: 110px; background: #e0e0e0; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #777; flex-shrink: 0;">📖</div>`;

      const card = document.createElement('div');
      card.className = 'card-projekt';
      card.style = 'background: #fff; border-radius: 10px; padding: 16px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #eef2f2;';
      card.innerHTML = `
        <div style="display: flex; gap: 16px; align-items: flex-start;">
          ${naslovnicaHtml}
          <div style="flex-grow: 1;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 4px;">
              <h3 style="margin: 0; color: #008080; font-size: 1.2em;">${p.naslov}</h3>
            </div>
            <div style="font-size: 0.88em; color: #666; margin-bottom: 8px;">${p.klijent || 'Independent project'}</div>
            
            <div style="margin-bottom: 6px; font-size: 0.9em;">
              <strong>Progress:</strong> ${odradjenoKartica.toFixed(2)} / ${ukupnoKartica.toFixed(2)} pages 
              <span style="color: #008080; font-weight: bold;">(${postotak}%)</span>
              <br><small class="text-muted">Translation contains ${(p.slovaPrijevod || 0).toLocaleString('en-US')} characters with spaces.</small>
            </div>

            <div style="background: #e6f2f2; border-radius: 6px; height: 10px; overflow: hidden; margin-bottom: 10px;">
              <div style="background: #008080; width: ${postotak}%; height: 100%; transition: width 0.3s ease;"></div>
            </div>

            <div style="font-size: 0.88em; margin-bottom: 10px;">
              ${dnevniRitamText}
            </div>

            <div style="background: #f9fbfb; padding: 8px 12px; border-radius: 6px; font-size: 0.88em; margin-bottom: 12px; border-left: 3px solid #008080; display: flex; justify-content: space-between;">
              <span><strong>Earnings:</strong> €${zaradjenoDoSada} / €${ukupniHonorar}</span>
              <span style="color: #666;">(€${honorarPoKartici.toFixed(2)}/page)</span>
            </div>

            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button id="btn-unos-${p.id}" class="btn-primary" style="padding: 6px 12px; font-size: 0.85em; background: #008080; color: #fff; border: none; border-radius: 4px; cursor: pointer;">📝 Unos znakova</button>
              <button id="btn-edit-${p.id}" class="btn-secondary" style="padding: 6px 12px; font-size: 0.85em;">✏️ Edit</button>
              <button id="btn-del-${p.id}" class="btn-secondary" style="padding: 6px 12px; font-size: 0.85em; color: #c62828;">🗑️ Delete</button>
              <button id="btn-analiza-${p.id}" type="button" class="btn-secondary" style="padding: 6px 12px; font-size: 0.85em; background: #f0f7f7; color: #008080; border: 1px solid #008080;">🧠 Tekstualna analiza</button>
            </div>
          </div>
        </div>
      `;

      fragment.appendChild(card);
    });

    dashboardDiv.appendChild(fragment);

    projekti.forEach(p => {
      document.getElementById(`btn-unos-${p.id}`)?.addEventListener('click', () => rucniUnosZnakova(p.id, ucitajDashboard));
      document.getElementById(`btn-edit-${p.id}`)?.addEventListener('click', () => urediProjekt(p.id));
      document.getElementById(`btn-del-${p.id}`)?.addEventListener('click', () => obrisiProjekt(p.id));
      document.getElementById(`btn-analiza-${p.id}`)?.addEventListener('click', (e) => pokreniTekstualnuAnalizu(p.id, e));
    });

  } catch (err) {
    console.error("Error loading dashboard:", err);
  }
}

export async function spremiProjektForma(event) {
  event.preventDefault();

  const id = document.getElementById('p-id').value || 'proj_' + Date.now();
  const postojeciProjekt = await dohvatiProjektPoId(id);
  const epubInput = document.getElementById('p-epub-file');
  
  let epubBlob = postojeciProjekt ? postojeciProjekt.epubBlob || null : null;
  let epubNazivDatoteke = postojeciProjekt ? postojeciProjekt.epubNazivDatoteke || null : null;

  if (epubInput && epubInput.files && epubInput.files[0]) {
    epubBlob = epubInput.files[0];
    epubNazivDatoteke = epubInput.files[0].name;
  }

  const noviProjekt = {
    id: id,
    naslov: document.getElementById('p-naslov').value,
    klijent: document.getElementById('p-klijent').value,
    ukupnoKartica: parseFloat(document.getElementById('p-ukupno').value) || 0,
    honorarPoKartici: parseFloat(document.getElementById('p-honorar').value) || 0,
    datumPocetka: document.getElementById('p-start').value,
    datumRoka: document.getElementById('p-rok').value,
    ciljDnevno: parseFloat(document.getElementById('p-cilj-dnevno').value) || 0,
    radVikendom: document.getElementById('p-vikend').value,
    
    naslovnicaBase64: document.getElementById('p-naslovnica-base64').value || null,
    slovaOriginal: parseInt(document.getElementById('p-slova-original').value) || 0,
    slovaPrijevod: parseInt(document.getElementById('p-slova-prijevod').value) || 0,
    gdocUrl: document.getElementById('p-gdoc-url') ? document.getElementById('p-gdoc-url').value : null,
    lastSynced: document.getElementById('p-last-synced').value || null,
    
    epubBlob: epubBlob,
    epubNazivDatoteke: epubNazivDatoteke,
    tekstIzvora: postojeciProjekt ? postojeciProjekt.tekstIzvora || null : null
  };

  await spremiUStorage(noviProjekt);
  
  toggleFormaProjekta(true);
  await ucitajDashboard();
}

export async function urediProjekt(id) {
  const p = await dohvatiProjektPoId(id);
  if (!p) return;

  document.getElementById('p-id').value = p.id;
  document.getElementById('p-naslov').value = p.naslov || '';
  document.getElementById('p-klijent').value = p.klijent || '';
  document.getElementById('p-ukupno').value = p.ukupnoKartica || '';
  document.getElementById('p-honorar').value = p.honorarPoKartici || '';
  document.getElementById('p-start').value = p.datumPocetka || '';
  document.getElementById('p-rok').value = p.datumRoka || '';
  document.getElementById('p-cilj-dnevno').value = p.ciljDnevno || '';
  document.getElementById('p-vikend').value = p.radVikendom || 'ne';
  
  document.getElementById('p-naslovnica-base64').value = p.naslovnicaBase64 || '';
  document.getElementById('p-slova-original').value = p.slovaOriginal || 0;
  document.getElementById('p-slova-prijevod').value = p.slovaPrijevod || 0;

  const epubInput = document.getElementById('p-epub-file');
  if (epubInput) epubInput.value = '';

  const epubNameLabel = document.getElementById('p-epub-file-name');
  if (epubNameLabel) {
    if (p.epubBlob) {
      const fileName = p.epubBlob.name || p.epubNazivDatoteke || "Učitani EPUB spremljen u bazi";
      epubNameLabel.innerHTML = `📄 Učitana datoteka: <strong>${fileName}</strong>`;
      epubNameLabel.style.color = '#2e7d32';
    } else {
      epubNameLabel.innerText = "Nije priložena EPUB datoteka.";
      epubNameLabel.style.color = '#777';
    }
  }
    
  if (document.getElementById('p-gdoc-url')) {
    document.getElementById('p-gdoc-url').value = p.gdocUrl || '';
  }
  document.getElementById('p-last-synced').value = p.lastSynced || '';

  const imgPreview = document.getElementById('img-cover-preview');
  const previewBox = document.getElementById('metrika-preview');
  if (p.naslovnicaBase64 && imgPreview) {
    imgPreview.src = p.naslovnicaBase64;
    imgPreview.style.display = 'block';
  }
  if (previewBox) previewBox.style.display = 'block';

  const formaNaslov = document.getElementById('forma-naslov');
  if (formaNaslov) formaNaslov.innerText = 'Edit Project';
  
  const formaContainer = document.getElementById('forma-projekt-container');
  if (formaContainer) {
    formaContainer.style.display = 'block';
    formaContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export async function obrisiProjekt(id) {
  if (!confirm('Are you sure you want to delete this project and all its entries?')) return;
  await obrisiProjektIzStoragea(id);
  await ucitajDashboard();
}

export function toggleFormaProjekta(forceClose = false) {
  const container = document.getElementById('forma-projekt-container');
  const btnNovi = document.getElementById('btn-novi-projekt');

  if (!container) return;

  const jeOtvoreno = container.style.display !== 'none' && container.style.display !== '';

  if (jeOtvoreno || forceClose) {
    container.style.display = 'none';
    if (btnNovi) btnNovi.innerText = '+ New Project';
    ocistiFormuProjekta();
  } else {
    ocistiFormuProjekta();
    container.style.display = 'block';
    if (btnNovi) btnNovi.innerText = '✕ Close Form';
    container.scrollIntoView({ behavior: 'smooth' });
  }
}

export function ocistiFormuProjekta() {
  const form = document.getElementById('form-projekt');
  if (form) form.reset();

  const fields = ['p-id', 'p-gdoc-url', 'p-naslovnica-base64', 'p-last-synced'];
  fields.forEach(f => {
    const el = document.getElementById(f);
    if (el) el.value = '';
  });

  ['p-slova-original', 'p-slova-prijevod'].forEach(f => {
    const el = document.getElementById(f);
    if (el) el.value = '0';
  });

  const statusMsg = document.getElementById('fetch-status-msg');
  if (statusMsg) {
    statusMsg.innerText = '';
    statusMsg.style.display = 'none';
  }

  const imgCover = document.getElementById('img-cover-preview');
  if (imgCover) {
    imgCover.style.display = 'none';
    imgCover.src = '';
  }

  const metrikaPreview = document.getElementById('metrika-preview');
  if (metrikaPreview) metrikaPreview.style.display = 'none';
}

export function azurirajePrikazImenaEpuba(input) {
  const epubNameLabel = document.getElementById('p-epub-file-name');
  if (!epubNameLabel) return;

  if (input.files && input.files[0]) {
    const file = input.files[0];
    epubNameLabel.innerHTML = `📄 Odabrana nova datoteka: <strong>${file.name}</strong>`;
    epubNameLabel.style.color = '#1976d2';
  }
}

export async function izveziSigurnosnuKopiju() {
  try {
    const db = await otvoriBazu();

    const txP = db.transaction(STORE_NAME, 'readonly');
    const projekti = await new Promise((res, rej) => {
      const req = txP.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    const txU = db.transaction(UNOSI_STORE, 'readonly');
    const unosi = await new Promise((res, rej) => {
      const req = txU.objectStore(UNOSI_STORE).getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    const backupData = {
      version: 6,
      datum: new Date().toISOString(),
      projekti: projekti,
      unosi: unosi
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `mojih1500_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

  } catch (err) {
    console.error("Error exporting backup:", err);
    alert("Backup export failed.");
  }
}

export async function uveziSigurnosnuKopiju(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);

      if (!data.projekti || !Array.isArray(data.projekti)) {
        throw new Error("File structure is invalid.");
      }

      const db = await otvoriBazu();

      const txP = db.transaction(STORE_NAME, 'readwrite');
      const storeP = txP.objectStore(STORE_NAME);
      for (const p of data.projekti) {
        storeP.put(p);
      }

      if (data.unosi && Array.isArray(data.unosi)) {
        const txU = db.transaction(UNOSI_STORE, 'readwrite');
        const storeU = txU.objectStore(UNOSI_STORE);
        for (const u of data.unosi) {
          storeU.put(u);
        }
      }

      alert("Backup successfully restored!");
      await ucitajDashboard();

    } catch (err) {
      console.error("Error importing backup:", err);
      alert("Failed to load backup. Ensure the file is valid JSON.");
    } finally {
      event.target.value = '';
    }
  };

  reader.readAsText(file);
}


export async function povuciPodatkeIzIzvora() {
  const epubInput = document.getElementById('p-epub-file');
  const gdocInput = document.getElementById('p-gdoc-url');
  const statusMsg = document.getElementById('fetch-status-msg');

  const file = epubInput ? epubInput.files[0] : null;
  const gdocUrl = gdocInput ? gdocInput.value.trim() : "";

  if (!file && !gdocUrl) {
    alert("Please select an ePub file or enter a Google Docs URL.");
    return;
  }

  statusMsg.innerText = "Analyzing and fetching data...";
  statusMsg.style.display = 'block';

  let origSlova = parseInt(document.getElementById('p-slova-original').value) || 0;
  let docSlova = parseInt(document.getElementById('p-slova-prijevod').value) || 0;

  try {
    if (file) {
      statusMsg.innerText = "Reading ePub and counting characters...";
      const epubData = await parseEpubFile(file);
      
      if (epubData.title && !document.getElementById('p-naslov').value) {
        document.getElementById('p-naslov').value = epubData.title;
      }

      if (epubData.coverBase64) {
        document.getElementById('p-naslovnica-base64').value = epubData.coverBase64;
        const imgCover = document.getElementById('img-cover-preview');
        if (imgCover) {
          imgCover.src = epubData.coverBase64;
          imgCover.style.display = 'block';
        }
      }

      origSlova = epubData.charCount;
      document.getElementById('p-slova-original').value = origSlova;
      
      const karticaOrig = (origSlova / 1800).toFixed(2);
      document.getElementById('p-ukupno').value = karticaOrig;
    }

    if (gdocUrl) {
      statusMsg.innerText = "Dohvaćanje teksta s Google Docsa...";
      const tekstPrijevoda = await dohvatiCijeliTekstIzGDoca(gdocUrl);
      docSlova = tekstPrijevoda.length;
      document.getElementById('p-slova-prijevod').value = docSlova;
    }

    const lblOrigSlova = document.getElementById('lbl-slova-orig');
    const lblOrigKartice = document.getElementById('lbl-kartice-orig');
    const lblDocSlova = document.getElementById('lbl-slova-doc');
    const lblDocKartice = document.getElementById('lbl-kartice-doc');

    if (lblOrigSlova) lblOrigSlova.innerText = origSlova.toLocaleString();
    if (lblOrigKartice) lblOrigKartice.innerText = (origSlova / 1800).toFixed(2);

    if (lblDocSlova) lblDocSlova.innerText = docSlova.toLocaleString();
    if (lblDocKartice) lblDocKartice.innerText = (docSlova / 1800).toFixed(2);

    const metrikaPreview = document.getElementById('metrika-preview');
    if (metrikaPreview) metrikaPreview.style.display = 'block';

    statusMsg.innerText = "Data successfully fetched!";

  } catch (err) {
    alert("Error fetching data: " + err.message);
    statusMsg.innerText = "An error occurred.";
  }
}
