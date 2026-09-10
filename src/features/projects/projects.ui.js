// Renderiranje sučelja projekata i kontrola formi

import { otvoriBazu, STORE_NAME, UNOSI_STORE, spremiUStorage } from '../../core/db.js';
import { dohvatiSveProjekte, dohvatiProjektPoId, obrisiProjektIzStoragea, izracunajPreostaleDane, rucniUnosZnakova } from './projects.js';
import { pokreniTekstualnuAnalizu } from '../interlinear/interlinear.js';
import { parseEpubFile } from '../epub-parser/epub.parser.js';
import { dohvatiCijeliTekstIzEpuba } from '../interlinear/interlinear.js';
import { parsePdfFile, jePdfDatoteka } from '../pdf-parser/pdf.parser.js';
import { dohvatiCijeliTekstIzGDoca } from '../google-drive/drive.api.js';
import { parseDocumentFile, jePodrzanaDokumentDatoteka } from '../document-parser/document.parser.js';

let pendingTranslationFileHandle = null;
if (typeof window !== 'undefined') {
  window.addEventListener('translation-file-selected', event => {
    pendingTranslationFileHandle = event.detail?.handle || null;
  });
}

async function dohvatiDatotekuPrijevoda(projekt, selectedFile) {
  if (selectedFile) return selectedFile;
  if (pendingTranslationFileHandle) return pendingTranslationFileHandle.getFile();
  if (projekt?.translationFileHandle) {
    try {
      return await projekt.translationFileHandle.getFile();
    } catch (error) {
      throw new Error('Dokument više nije na izvornoj putanji. Ponovno uploadajte dokument prije nastavka.');
    }
  }
  return projekt?.translationFile || null;
}
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
              <button id="btn-edit-${p.id}" class="btn-secondary">
                <svg class="btn-icon" viewBox="0 0 24 24" width="20" height="20" fill="none">
                <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" 
                stroke="#008080" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
                <!--  Akcent na vrhu olovke -->
                <path d="M13.5 6.5l3.5 3.5" stroke="#D97706" stroke-width="1.75"/>
                </svg>
              Edit </button>
              <button id="btn-refresh-${p.id}" class="btn-secondary"> 
                <svg class="btn-icon" viewBox="0 0 24 24" width="20" height="20" fill="none">    
                <path d="M4 12a8 8 0 0113.856-5.5M20 12a8 8 0 01-13.856 5.5" stroke="#008080" stroke-width="1.75" stroke-linecap="round"/>
                <!-- Strelica gore -->
                <path d="M18 3v4h-4" stroke="#008080" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
                <!-- Strelica dolje -->
                <path d="M6 21v-4h4" stroke="#008080" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
                <!-- Središnji akcent (prijevod) -->
                <circle cx="12" cy="12" r="2" fill="#D97706"/>
                </svg>
              Refresh Translation</button>
              <button id="btn-analiza-${p.id}" type="button" class="btn-secondary">
              <svg class="btn-icon" viewBox="0 0 24 24" width="20" height="20" fill="none">
                <!-- Otvorene stranice teksta -->
                <path d="M4 6C4 4.89543 4.89543 4 6 4H12V20H6C4.89543 20 4 19.1046 4 18V6Z" stroke="#008080" stroke-width="2" fill="#E0F2F1"/>
                <path d="M12 4H18C19.1046 4 20 4.89543 20 6V18C20 19.1046 19.1046 20 18 20H12V4Z" stroke="#008080" stroke-width="2" fill="#FFFFFF"/>
                <!-- Linije teksta (ritam) -->
                <path d="M7 8H10" stroke="#008080" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M7 11H9" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M7 14H10" stroke="#008080" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M14 8H17" stroke="#008080" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M14 11H16" stroke="#4DD0E1" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M14 14H17" stroke="#008080" stroke-width="1.5" stroke-linecap="round"/>
                <!-- Povećalo/QA analiza (Analitika) -->
                <circle cx="17" cy="17" r="4" stroke="#D97706" stroke-width="2" fill="#FFFFFF"/>
                <path d="M20.5 20.5L19 19" stroke="#D97706" stroke-width="2" stroke-linecap="round"/>
                </svg>                          
              Analyze Text</button>
              <button id="btn-del-${p.id}" class="btn-danger">
                <svg class="btn-icon" viewBox="0 0 24 24" width="20" height="20" fill="none">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" 
                stroke="#DC2626" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              Delete</button>
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
      document.getElementById(`btn-refresh-${p.id}`)?.addEventListener('click', () => osvjeziPrijevodProjekta(p.id));
      document.getElementById(`btn-del-${p.id}`)?.addEventListener('click', () => obrisiProjekt(p.id));
      document.getElementById(`btn-analiza-${p.id}`)?.addEventListener('click', (e) => pokreniTekstualnuAnalizu(p.id, e));
    });

  } catch (err) {
    console.error("Error loading dashboard:", err);
  }
}

export async function osvjeziPrijevodProjekta(id) {
  const projekt = await dohvatiProjektPoId(id);
  const sourceMode = projekt?.translationSource || (projekt?.gdocUrl ? 'gdoc' : 'file');
  if (!projekt || (sourceMode === 'gdoc' && !projekt.gdocUrl)) {
    alert('Ovaj projekt nema postavljen izvor prijevoda.');
    return;
  }

  try {
    const file = sourceMode === 'file' ? await dohvatiDatotekuPrijevoda(projekt) : null;
    const translation = sourceMode === 'file'
      ? await parseDocumentFile(file)
      : await dohvatiCijeliTekstIzGDoca(projekt.gdocUrl);
    projekt.tekstPrijevoda = translation;
    projekt.slovaPrijevod = translation.length;
    if (file) {
      projekt.translationFileName = file.name;
      projekt.translationFileModified = file.lastModified;
      projekt.translationFileSize = file.size;
    }
    projekt.lastSynced = new Date().toISOString();
    await spremiUStorage(projekt);
    await ucitajDashboard();
  } catch (error) {
    console.error('Greška pri osvježavanju prijevoda:', error);
    alert(`Osvježavanje prijevoda nije uspjelo: ${error.message}`);
  }
}


export async function spremiProjektForma(event) {
  if (event) event.preventDefault();

  try {
    console.log("Počinje spremanje projekta...");
    
    // Nativna provjera obaveznih polja iz HTML-a
    const form = document.getElementById('projekt-forma');
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const idInput = document.getElementById('p-id');
    // ID se računa JEDNOM i koristi dosljedno kroz cijelu funkciju (i za provjeru
    // postojećeg zapisa i za sam upis) - ranije se za upis ponovno zvao Date.now(),
    // pa je nakon nekoliko await koraka projekt znao završiti pod DRUGIM ID-em
    // od onog kojim je provjeravan "postojeciProjekt".
    const id = (idInput && idInput.value) ? idInput.value : 'proj_' + Date.now();

    const postojeciProjekt = await dohvatiProjektPoId(id);
    const epubInput = document.getElementById('p-epub-file');
    const translationFileInput = document.getElementById('p-translation-file');

    const slovaOrigInput = document.getElementById('p-slova-original');
    const slovaDocInput = document.getElementById('p-slova-prijevod');

    const slovaOriginal = slovaOrigInput ? (parseInt(slovaOrigInput.value, 10) || 0) : 0;
    const slovaPrijevod = slovaDocInput ? (parseInt(slovaDocInput.value, 10) || 0) : 0;
    
    const tempGdocText = form?.dataset?.tempGdocText || null;
    const tempEpubText = form?.dataset?.tempEpubText || null;
    const translationSource = document.getElementById('p-translation-source-mode')?.value || 'gdoc';
    const selectedTranslationFile = translationSource === 'file' && translationFileInput?.files?.[0]
      ? translationFileInput.files[0]
      : null;

    let epubNaziv = postojeciProjekt ? postojeciProjekt.epubNazivDatoteke || postojeciProjekt.izvorNazivDatoteke || null : null;

    // STRATEGIJA SPREMANJA: čuvamo SAMO izvučeni čisti tekst (tekstIzvora), a ne
    // sirovi ePub Blob. Blob u IndexedDB nepotrebno napuhuje bazu i ovisi o
    // strukturiranom kloniranju binarnih objekata; za analizu nam treba isključivo
    // tekst, pa ga izvlačimo odmah pri spremanju i spremamo kao obični string.
    let tekstIzvora = tempEpubText || (postojeciProjekt ? postojeciProjekt.tekstIzvora || null : null);
    let translationFile = postojeciProjekt?.translationFile || null;
    let translationFileHandle = postojeciProjekt?.translationFileHandle || null;

    if (epubInput && epubInput.files && epubInput.files[0]) {
      const selectedFile = epubInput.files[0];
      epubNaziv = selectedFile.name;
      try {
        if (jePdfDatoteka(selectedFile)) {
          const pdfData = await parsePdfFile(selectedFile);
          tekstIzvora = pdfData.text;
          const coverInput = document.getElementById('p-naslovnica-base64');
          if (coverInput && !coverInput.value && pdfData.coverDataUrl) {
            coverInput.value = pdfData.coverDataUrl;
          }

          const titleInput = document.getElementById('p-naslov');
          if (titleInput && !titleInput.value && pdfData.title) {
            titleInput.value = pdfData.title;
          }

          if (translationSource === 'file') {
            const file = await dohvatiDatotekuPrijevoda(postojeciProjekt, selectedTranslationFile);
            if (!jePodrzanaDokumentDatoteka(file)) {
              throw new Error('Podržani formati su DOCX, RTF, ODT i TXT.');
            }
            translationFile = file;
            translationFileHandle = selectedTranslationFile ? pendingTranslationFileHandle : translationFileHandle;
            const translationText = await parseDocumentFile(file);
            if (!translationText.trim()) throw new Error('Odabrani dokument ne sadrži tekst.');
            if (form) form.dataset.tempGdocText = translationText;
          }
        } else {
          tekstIzvora = await dohvatiCijeliTekstIzEpuba(selectedFile);
        }
        if (!tekstIzvora || tekstIzvora.trim().length === 0) {
          console.warn("ePub je parsiran, ali iz njega nije izvučen tekst (prazan sadržaj).");
        }
      } catch (e) {
        console.error("Nije moguće ekstrahirati tekst iz ePub-a pri spremanju:", e);
        alert("Odabrana ePub datoteka nije mogla biti obrađena. Projekt će biti spremljen bez izvornog teksta.");
      }
    }

    const citajBroj = (id, pretvoriUFloat = false) => {
      const el = document.getElementById(id);
      if (!el || !el.value || el.value === 'undefined') return 0;
      const val = pretvoriUFloat ? parseFloat(el.value) : parseInt(el.value, 10);
      return isNaN(val) ? 0 : val;
    };

    const noviProjekt = {
      ...(postojeciProjekt || {}),
      id: id,
      naslov: document.getElementById('p-naslov')?.value.trim() || "Bez naslova",
      klijent: document.getElementById('p-klijent')?.value.trim() || '',
      slovaOriginal: slovaOriginal,
      slovaPrijevod: slovaPrijevod,
      ukupnoKartica: parseFloat(document.getElementById('p-ukupno')?.value) || parseFloat((slovaOriginal / 1800).toFixed(2)),
      honorarPoKartici: citajBroj('p-honorar', true),
      datumPocetka: document.getElementById('p-start')?.value || '',
      datumRoka: document.getElementById('p-rok')?.value || '',
      ciljDnevno: citajBroj('p-cilj-dnevno', true),
      radVikendom: document.getElementById('p-vikend')?.value || 'ne',
      naslovnicaBase64: document.getElementById('p-naslovnica-base64')?.value || null,
      gdocUrl: translationSource === 'gdoc'
        ? document.getElementById('p-gdoc-url')?.value.trim() || postojeciProjekt?.gdocUrl || ""
        : "",
      translationSource,
      translationFile,
      translationFileHandle,
      translationFileName: translationFile?.name || postojeciProjekt?.translationFileName || null,
      translationFileModified: translationFile?.lastModified || postojeciProjekt?.translationFileModified || null,
      translationFileSize: translationFile?.size || postojeciProjekt?.translationFileSize || null,
      lastSynced: postojeciProjekt?.lastSynced || new Date().toISOString(),
      epubNazivDatoteke: epubNaziv,
      izvorNazivDatoteke: epubNaziv,
      tekstIzvora: tekstIzvora,
      tekstPrijevoda: tempGdocText || (postojeciProjekt ? postojeciProjekt.tekstPrijevoda : null)
    };

    console.log("Projekt spreman za upis:", noviProjekt);

    // 3. Upis u bazu
    await spremiUStorage(noviProjekt);
    console.log("Projekt uspješno upisan u IndexedDB!");

    if (form) {
      delete form.dataset.tempGdocText;
      delete form.dataset.tempEpubText;
    }

    // 4. Zatvaranje forme i osvježavanje prikaza
    toggleFormaProjekta(true);
    await ucitajDashboard(); // <-- Pozivanje ucitajDashboard() osvježava ekran

  } catch (err) {
    console.error("Greška pri spremanju projekta u bazu:", err);
    alert("Greška pri spremanju: " + err.message);
  }
}

export async function urediProjekt(id) {
  const p = await dohvatiProjektPoId(id);
  if (!p) return;

  const form = document.getElementById('projekt-forma');
  if (form) {
    delete form.dataset.tempGdocText;
    delete form.dataset.tempEpubText;
  }

  document.getElementById('p-id').value = p.id;
  document.getElementById('p-naslov').value = p.naslov || '';
  document.getElementById('p-klijent').value = p.klijent || '';
  document.getElementById('p-ukupno').value = p.ukupnoKartica ?? '';
  document.getElementById('p-honorar').value = p.honorarPoKartici ?? '';
  document.getElementById('p-start').value = p.datumPocetka || '';
  document.getElementById('p-rok').value = p.datumRoka || '';
  document.getElementById('p-cilj-dnevno').value = p.ciljDnevno ?? '';
  document.getElementById('p-vikend').value = p.radVikendom || 'ne';
  
  document.getElementById('p-naslovnica-base64').value = p.naslovnicaBase64 || '';
  
  // POPRAVLJENO: p.slovaOriginal umjesto epubData.charCount
  document.getElementById('p-slova-original').value = p.slovaOriginal ?? 0;
  document.getElementById('p-slova-prijevod').value = p.slovaPrijevod ?? 0;

  const epubInput = document.getElementById('p-epub-file');
  if (epubInput) epubInput.value = '';

  const epubNameLabel = document.getElementById('p-epub-file-name');
  if (epubNameLabel) {
    if (p.tekstIzvora) {
      const fileName = p.epubNazivDatoteke || p.izvorNazivDatoteke || "Učitani izvor spremljen u bazi";
      epubNameLabel.innerHTML = `📄 Učitana datoteka: <strong>${fileName}</strong> (tekst spremljen ✓)`;
      epubNameLabel.style.color = '#2e7d32';
    } else {
      epubNameLabel.innerText = "Nije priložena EPUB datoteka.";
      epubNameLabel.style.color = '#777';
    }
  }
    
  if (document.getElementById('p-gdoc-url')) {
    document.getElementById('p-gdoc-url').value = p.gdocUrl || '';
  }
  document.getElementById('p-translation-source-mode').value = p.translationSource || (p.gdocUrl ? 'gdoc' : 'file');
  const translationFileInput = document.getElementById('p-translation-file');
  if (translationFileInput) translationFileInput.value = '';
  const translationFileLabel = document.getElementById('p-translation-file-name');
  if (translationFileLabel) {
    translationFileLabel.textContent = p.translationFileName
      ? `📄 Spremljena datoteka: ${p.translationFileName}`
      : 'Nije odabrana datoteka';
    translationFileLabel.style.color = p.translationFileName ? '#2e7d32' : '#555';
  }
  pendingTranslationFileHandle = p.translationFileHandle || null;
  document.getElementById('tab-gdoc')?.click();
  if ((p.translationSource || (p.gdocUrl ? 'gdoc' : 'file')) === 'file') {
    document.getElementById('tab-document-file')?.click();
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
  const btnNovi = document.getElementById('btn-novi-projekt');
  if (btnNovi) btnNovi.innerText = '✕ Close Form';
  
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
  const form = document.getElementById('projekt-forma');
  if (form) form.reset();

  const fields = ['p-id', 'p-gdoc-url', 'p-naslovnica-base64', 'p-last-synced', 'p-translation-source-mode'];
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

  const epubNameLabel = document.getElementById('p-epub-file-name');
  if (epubNameLabel) {
    epubNameLabel.innerText = 'Nije odabrana datoteka';
    epubNameLabel.style.color = '#555';
  }

  const translationFileLabel = document.getElementById('p-translation-file-name');
  if (translationFileLabel) {
    translationFileLabel.innerText = 'Nije odabrana datoteka';
    translationFileLabel.style.color = '#555';
  }
  const translationFileInput = document.getElementById('p-translation-file');
  if (translationFileInput) translationFileInput.value = '';
  pendingTranslationFileHandle = null;
  document.getElementById('tab-gdoc')?.click();

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


export async function povuciPodatkeIzIzvora(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const epubInput = document.getElementById('p-epub-file');
  const gdocInput = document.getElementById('p-gdoc-url');
  const translationFileInput = document.getElementById('p-translation-file');
  const sourceMode = document.getElementById('p-translation-source-mode')?.value || 'gdoc';
  const statusMsg = document.getElementById('fetch-status-msg');

  const file = epubInput?.files[0];
  const gdocUrl = gdocInput?.value.trim();
  const selectedTranslationFile = translationFileInput?.files?.[0] || null;

  if (!file && !gdocUrl && !(sourceMode === 'file' && selectedTranslationFile)) {
    alert("Molimo odaberite ePub/PDF datoteku i izvor prijevoda.");
    return false;
  }

  if (statusMsg) {
    statusMsg.innerText = "Dohvaćanje i obrada u tijeku...";
    statusMsg.style.display = 'block';
  }

  try {
    let charCountOrig = 0;
    let charCountDoc = 0;
    let dohvaceniTekstGDoca = null;

    // 1. Parsiranje ePub/PDF datoteke
    if (file) {
      const sourceData = jePdfDatoteka(file)
        ? await parsePdfFile(file, progress => {
          if (statusMsg && progress.pages) {
            statusMsg.innerText = `OCR obrada stranice ${progress.page}/${progress.pages}...`;
          }
        })
        : await parseEpubFile(file);
      console.log("Parsirani izvor:", sourceData);

      if (sourceData && sourceData.origCharCount) {
        charCountOrig = sourceData.origCharCount;
      }

      // Popunjavanje naslova ako je prazan
      const elNaslov = document.getElementById('p-naslov');
      if (elNaslov && !elNaslov.value && sourceData.title) {
        elNaslov.value = sourceData.title;
      }

      // Naslovnica ako postoji
      if (sourceData?.coverDataUrl) {
        const inputCover = document.getElementById('p-naslovnica-base64');
        if (inputCover) inputCover.value = sourceData.coverDataUrl;
      }

      const epubText = sourceData.text || await dohvatiCijeliTekstIzEpuba(file);
      const formElement = document.getElementById('projekt-forma');
      if (formElement) formElement.dataset.tempEpubText = epubText;
    }

    // 2. Parsiranje Google Docsa ili lokalnog dokumenta
    if (sourceMode === 'file') {
      const projectId = document.getElementById('p-id')?.value;
      const existingProject = projectId ? await dohvatiProjektPoId(projectId) : null;
      const translationFile = await dohvatiDatotekuPrijevoda(existingProject, selectedTranslationFile);
      if (!jePodrzanaDokumentDatoteka(translationFile)) {
        throw new Error('Podržani formati su DOCX, RTF, ODT i TXT.');
      }
      dohvaceniTekstGDoca = await parseDocumentFile(translationFile);
      const formElement = document.getElementById('projekt-forma');
      if (formElement) formElement.dataset.tempTranslationFile = 'selected';
      pendingTranslationFileHandle = pendingTranslationFileHandle || null;
      charCountDoc = dohvaceniTekstGDoca.length;
    } else if (gdocUrl) {
      dohvaceniTekstGDoca = await dohvatiCijeliTekstIzGDoca(gdocUrl);
      if (dohvaceniTekstGDoca && typeof dohvaceniTekstGDoca === 'string') {
        charCountDoc = dohvaceniTekstGDoca.length;
      }
    }

    // 3. Upisivanje izračunatih vrijednosti u HTML elemente forme
    const elSlovaOrig = document.getElementById('p-slova-original');
    const elSlovaDoc = document.getElementById('p-slova-prijevod');
    const elUkupnoKartica = document.getElementById('p-ukupno');

    if (elSlovaOrig) elSlovaOrig.value = charCountOrig;
    if (elSlovaDoc) elSlovaDoc.value = charCountDoc;
    const elKarticeOrig = document.getElementById('lbl-kartice-orig');
    const elKarticeDoc = document.getElementById('lbl-kartice-doc');
    const elLblSlovaOrig = document.getElementById('lbl-slova-orig');
    const elLblSlovaDoc = document.getElementById('lbl-slova-doc');
    if (elLblSlovaOrig) elLblSlovaOrig.textContent = charCountOrig.toLocaleString('en-US');
    if (elLblSlovaDoc) elLblSlovaDoc.textContent = charCountDoc.toLocaleString('en-US');
    if (elKarticeOrig) elKarticeOrig.textContent = (charCountOrig / 1800).toFixed(2);
    if (elKarticeDoc) elKarticeDoc.textContent = (charCountDoc / 1800).toFixed(2);

    if (elUkupnoKartica && charCountOrig > 0) {
      elUkupnoKartica.value = (charCountOrig / 1800).toFixed(2);
    }

    // Privremeno spremamo dohvaćene tekstove kako bi ih spremiProjektForma
    // preuzela bez oslanjanja na kasnije čitanje file inputa.
    const formElement = document.getElementById('projekt-forma');
    if (formElement && dohvaceniTekstGDoca) {
      formElement.dataset.tempGdocText = dohvaceniTekstGDoca;
    }

    if (statusMsg) {
    statusMsg.innerText = "Podaci uspješno dohvaćeni! Pregledajte polja i kliknite 'Spremi'.";
    statusMsg.style.color = "#2e7d32";
    }

    // Otvaramo/prikazujemo formu ako nije vidljiva kako bi korisnik mogao popuniti ostala polja
    const container = document.getElementById('forma-projekt-container');
    if (container && container.style.display === 'none') {
    container.style.display = 'block';
    }
   
    
  } catch (err) {
    console.error("Greška pri dohvaćanju ili spremanju:", err);
    alert("Došlo je do greške: " + err.message);
    if (statusMsg) statusMsg.innerText = "Greška pri obradi.";
  }

  return false;
}


// Izloži funkciju globalno kako bi je inline HTML onclick mogao vidjeti
window.spremiProjektForma = spremiProjektForma;
window.povuciPodatkeIzIzvora = povuciPodatkeIzIzvora;