// Prikaz interlinearni tekst paralelnih stupaca i sinhroniziranog skrolanja

import { otvoriBazu, INTERLINEARNI_STORE, STORE_NAME } from '../../core/db.js';
import { navigirajNa } from '../../core/router.js';
import {
  findMatchingParagraphIndices,
  getInterlinearSearchSuggestions,
  normalizeInterlinearSearchText
} from '../../utils/interlinearSearch.js';

const INTERLINEAR_PAGE_SIZE = 20;
const INTERLINEAR_MIN_SEARCH_LENGTH = 3;
let interlinearState = null;
let searchDebounceTimer = null;
let interlinearOutsideClickBound = false;

export async function prikaziInterlinearniTekst(projektId) {
 
  // Zaštita od nevažećih ID-ova ili prosljeđivanja neispravnih tipova
  if (!projektId || typeof projektId === 'function') {
    console.warn("prikaziInterlinearniTekst pozvan bez važećeg projektId-a:", projektId);
    return;
  }
  
  window.trenutniProjektId = projektId;

  // Prikaz sekcije/view-a (page-translation-analytics + interlinear-page) je
  // već odradio router PRIJE nego što je pozvao ovu funkciju (kao onEnter
  // rute 'translation-analytics/interlinear') - ovdje se brinemo samo za podatke.

  // Ažuriraj button za glosar
  const btnGlosar = document.querySelector('button[onclick="otvoriModalGlosar(this)"]');
  if (btnGlosar) {
    btnGlosar.setAttribute('data-projekt-id', projektId);
  }

  // 2. Dohvati podatke iz baze i napuni stupce...
  const db = await otvoriBazu();
  const tx = db.transaction(INTERLINEARNI_STORE, 'readonly');
  const store = tx.objectStore(INTERLINEARNI_STORE);
  
  let rezultat = await new Promise((resolve) => {
    const req = store.get(projektId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });

  const colIzvor = document.getElementById('col-izvor');
  const colPrijevod = document.getElementById('col-prijevod');
  const colKomentari = document.getElementById('col-komentari');

  if (!colIzvor || !colPrijevod || !colKomentari) return;

  const segmenti = Array.isArray(rezultat?.segmenti) ? rezultat.segmenti : [];
  if (segmenti.length === 0) {
    colIzvor.innerHTML = '<p class="text-muted">Nema podataka za prikaz.</p>';
    return;
  }

  const sourceParagraphs = rezultat.sourceParagraphs || rezultat.odlomciIzvor || segmenti.map(seg => seg.izvor || '');
  const targetParagraphs = rezultat.targetParagraphs || rezultat.odlomciPrijevod || segmenti.map(seg => seg.prijevod || '');
  interlinearState = {
    segmenti,
    sourceParagraphs,
    targetParagraphs,
    komentari: rezultat.komentari || [],
    filteredIndices: Array.from({ length: Math.max(sourceParagraphs.length, targetParagraphs.length) }, (_, index) => index),
    currentPage: 1,
    query: ''
  };

  const searchInput = document.getElementById('interlinear-search');
  if (searchInput) searchInput.value = '';
  const suggestions = document.getElementById('interlinear-suggestions');
  if (suggestions) {
    suggestions.innerHTML = '';
    suggestions.hidden = true;
  }
  postaviInterlinearPretragu();
  renderInterlinearPage();
}

function postaviInterlinearPretragu() {
  const searchInput = document.getElementById('interlinear-search');
  if (!searchInput || searchInput.dataset.bound === 'true') return;

  searchInput.dataset.bound = 'true';
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => primijeniInterlinearPretragu(searchInput.value), 250);
  });
  searchInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      clearTimeout(searchDebounceTimer);
      primijeniInterlinearPretragu(searchInput.value);
    }
  });

  if (!interlinearOutsideClickBound) {
    document.addEventListener('click', event => {
      const searchArea = searchInput.closest('.interlinear-search-wrap');
      const suggestions = document.getElementById('interlinear-suggestions');
      if (suggestions && searchArea && !searchArea.contains(event.target)) {
        suggestions.hidden = true;
      }
    });
    interlinearOutsideClickBound = true;
  }
}

function primijeniInterlinearPretragu(query) {
  if (!interlinearState) return;
  const trimmedQuery = query.trim();
  interlinearState.query = trimmedQuery;
  interlinearState.filteredIndices = trimmedQuery.length < INTERLINEAR_MIN_SEARCH_LENGTH
    ? Array.from(
      { length: Math.max(interlinearState.sourceParagraphs.length, interlinearState.targetParagraphs.length) },
      (_, index) => index
    )
    : findMatchingParagraphIndices(
      interlinearState.sourceParagraphs,
      interlinearState.targetParagraphs,
      trimmedQuery
    );
  interlinearState.currentPage = 1;
  renderInterlinearSuggestions();
  renderInterlinearPage();
}

function renderInterlinearSuggestions() {
  const suggestions = document.getElementById('interlinear-suggestions');
  if (!suggestions || !interlinearState) return;
  const query = interlinearState.query;
  suggestions.innerHTML = '';
  if (query.length < INTERLINEAR_MIN_SEARCH_LENGTH) {
    suggestions.hidden = true;
    return;
  }

  const indices = getInterlinearSearchSuggestions(
    interlinearState.sourceParagraphs,
    interlinearState.targetParagraphs,
    query
  );
  suggestions.hidden = indices.length === 0;
  indices.forEach(index => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'interlinear-suggestion';
    item.innerHTML = `#${index + 1}: ${istakniPojam(
      interlinearState.sourceParagraphs[index] || interlinearState.targetParagraphs[index],
      query
    )}`;
    item.addEventListener('click', () => {
      const searchInput = document.getElementById('interlinear-search');
      if (searchInput) searchInput.value = query;
      suggestions.hidden = true;
      primijeniInterlinearPretragu(query);
    });
    suggestions.appendChild(item);
  });
}

function istakniPojam(value, query) {
  const text = String(value || '(Prazno)');
  const normalizedQuery = normalizeInterlinearSearchText(query);
  const words = text.split(/(\s+)/);
  return words.map(word => normalizeInterlinearSearchText(word).includes(normalizedQuery)
    ? `<strong>${siguranTekst(word)}</strong>`
    : siguranTekst(word)).join('');
}

function siguranTekst(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function renderInterlinearPage() {
  if (!interlinearState) return;
  const colIzvor = document.getElementById('col-izvor');
  const colPrijevod = document.getElementById('col-prijevod');
  const colKomentari = document.getElementById('col-komentari');
  if (!colIzvor || !colPrijevod || !colKomentari) return;

  const totalPages = Math.max(1, Math.ceil(interlinearState.filteredIndices.length / INTERLINEAR_PAGE_SIZE));
  interlinearState.currentPage = Math.min(interlinearState.currentPage, totalPages);
  const start = (interlinearState.currentPage - 1) * INTERLINEAR_PAGE_SIZE;
  const pageIndices = interlinearState.filteredIndices.slice(start, start + INTERLINEAR_PAGE_SIZE);
  colIzvor.innerHTML = '';
  colPrijevod.innerHTML = '';
  colKomentari.innerHTML = '';
  colIzvor.scrollTop = 0;
  colPrijevod.scrollTop = 0;
  colKomentari.scrollTop = 0;

  pageIndices.forEach(index => {
    const pIndex = index + 1;
    const komentar = interlinearState.komentari.find(item => item.odlomakIndex === index);
    colIzvor.appendChild(stvoriOdlomak(index, pIndex, interlinearState.sourceParagraphs[index], '#008080'));
    colPrijevod.appendChild(stvoriOdlomak(index, pIndex, interlinearState.targetParagraphs[index], '#2e7d32'));
    const comment = document.createElement('div');
    comment.className = 'segment-item para-box';
    comment.dataset.index = index;
    comment.innerHTML = komentar && (komentar.sugestija || komentar.term)
      ? `<div class="interlinear-comment"><strong>✨ Gemini Napomena #${pIndex}:</strong><br>${komentar.sugestija || komentar.term}</div>`
      : `<small class="empty-comment">#${pIndex}</small> <span class="empty-comment">—</span>`;
    colKomentari.appendChild(comment);
  });

  renderInterlinearPagination(totalPages);
  sinkronizirajTrostrukiSkrol(colIzvor, colPrijevod, colKomentari);
  setTimeout(() => izjednaciVisineOdlomaka(colIzvor, colPrijevod, colKomentari), 50);
}

function stvoriOdlomak(index, pIndex, text, color) {
  const element = document.createElement('div');
  element.className = 'segment-item para-box';
  element.dataset.index = index;
  element.innerHTML = `<small style="color:${color}; font-weight:bold;">#${pIndex}</small><br>${siguranTekst(text || '(Prazno)')}`;
  return element;
}

function izjednaciVisineOdlomaka(...columns) {
  const nodes = columns.map(column => Array.from(column.querySelectorAll('.para-box')));
  nodes[0].forEach((node, index) => {
    const maxHeight = Math.max(...nodes.map(column => column[index]?.offsetHeight || 0));
    nodes.forEach(column => { if (column[index]) column[index].style.minHeight = `${maxHeight}px`; });
  });
}

function renderInterlinearPagination(totalPages) {
  const pagination = document.getElementById('interlinear-pagination');
  const status = document.getElementById('interlinear-results-count');
  if (!pagination || !status) return;
  status.textContent = `${interlinearState.filteredIndices.length} odlomaka · stranica ${interlinearState.currentPage} od ${totalPages}`;
  pagination.innerHTML = '';
  const addButton = (label, page, disabled = false) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = disabled;
    button.className = page === interlinearState.currentPage ? 'active' : '';
    button.addEventListener('click', () => {
      interlinearState.currentPage = page;
      renderInterlinearPage();
      document.getElementById('interlinear-page')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    pagination.appendChild(button);
  };
  addButton('Prethodna', interlinearState.currentPage - 1, interlinearState.currentPage === 1);
  for (let page = 1; page <= totalPages; page++) addButton(String(page), page);
  addButton('Sljedeća', interlinearState.currentPage + 1, interlinearState.currentPage === totalPages);
}

export function sinkronizirajTrostrukiSkrol(...elements) {
  let isSyncing = false;
  elements.forEach(el => {
    if (!el) return;
    el.onscroll = () => {
      if (!isSyncing) {
        isSyncing = true;
        const currentTop = el.scrollTop;
        elements.forEach(target => {
          if (target && target !== el) {
            target.scrollTop = currentTop;
          }
        });
        isSyncing = false;
      }
    };
  });
}

export function skociNaOdlomak(index) {
  const colIzvor = document.getElementById('col-izvor');
  if (!colIzvor) return;
  const target = colIzvor.querySelector(`.para-box[data-index="${index}"]`);
  
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.style.background = '#fff9c4';
    setTimeout(() => {
      target.style.background = '#fff';
    }, 2000);
  }
}

export async function prikaziSveAnalize() {
  // Prikaz sekcije/view-a (page-translation-analytics + analize-page) je već
  // odradio router prije poziva ove funkcije (onEnter rute
  // 'translation-analytics') - ovdje samo učitavamo podatke za listu.
  await ucitajListuAnaliza();
}

export async function ucitajListuAnaliza() {
  const container = document.getElementById('lista-analiza-container');
  if (!container) return;

  container.innerHTML = '<p class="text-muted">Učitavanje analiza...</p>';

  try {
    const db = await otvoriBazu();

    const txInterlinearniTekst = db.transaction(INTERLINEARNI_STORE, 'readonly');
    const sveAnalize = await new Promise((res, rej) => {
      const req = txInterlinearniTekst.objectStore(INTERLINEARNI_STORE).getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });

    if (sveAnalize.length === 0) {
      container.innerHTML = '<p class="text-muted">Trenutno nema spremljenih analiza.</p>';
      return;
    }

    const txProjekti = db.transaction(STORE_NAME, 'readonly');
    const sviProjekti = await new Promise((res, rej) => {
      const req = txProjekti.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });

    const projektiMapa = new Map(sviProjekti.map(p => [p.id, p]));
    container.innerHTML = '';

    sveAnalize.forEach(analiza => {
      const projekt = projektiMapa.get(analiza.projektId);
      const naslovProjekta = projekt ? projekt.naslov : `Projekt ID: ${analiza.projektId}`;

      const card = document.createElement('div');
      card.className = 'card-analiza';
      
      card.style.cssText = 'background: rgb(255, 255, 255); border-radius: 10px; padding: 16px; margin-bottom: 20px; box-shadow: rgba(0, 0, 0, 0.08) 0px 2px 8px; border: 1px solid rgb(238, 242, 242)';
      card.innerHTML = `
        <h4 style="margin:0 0 8px 0; color:#008080;">${naslovProjekta}</h4>
        <p style="font-size:0.85em; color:#666; margin-bottom:12px;">Datum analize: ${new Date(analiza.datumAnalize).toLocaleString('hr-HR')}</p>
        <button id="btn-otvori-analizu-${analiza.projektId}" class="btn-primary">
          <svg class="btn-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="20" x2="18" y2="10"/>
          <line x1="12" y1="20" x2="12" y2="4"/>
          <line x1="6" y1="20" x2="6" y2="14"/>
          <circle cx="18" cy="6" r="3"/>
          </svg>
        Otvorite analizu</button>
        <button id="btn-obrisi-analizu-${analiza.projektId}" class="btn-danger">
          <svg class="btn-icon" viewBox="0 0 24 24" width="20" height="20" fill="none">
          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" 
          stroke="#DC2626" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>   
        Obriši</button>
      `;

      container.appendChild(card);

      // Listener za otvaranje analize
      document.getElementById(`btn-otvori-analizu-${analiza.projektId}`)?.addEventListener('click', () => {
        navigirajNa('translation-analytics/interlinear', { projektId: analiza.projektId });
      });
      // Listener za brisanje analize
      document.getElementById(`btn-obrisi-analizu-${analiza.projektId}`)?.addEventListener('click', () => {
        obrisiAnalizirano(analiza.projektId);
  });
    });

  } catch (e) {
    console.error("Greška pri učitavanju analiza:", e);
  }
}

export async function obrisiAnalizirano(projektId) {
  if (!confirm("Jeste li sigurni da želite obrisati spremljenu analizu?")) return;

  try {
    const db = await otvoriBazu();
    const tx = db.transaction(INTERLINEARNI_STORE, 'readwrite');
    const store = tx.objectStore(INTERLINEARNI_STORE);
    
    store.delete(projektId);
    if (!isNaN(projektId)) store.delete(Number(projektId));

    tx.oncomplete = () => {
      ucitajListuAnaliza();
    };
  } catch (err) {
    console.error("Greška pri brisanju analize:", err);
  }
}

window.obrisiAnalizirano = obrisiAnalizirano;