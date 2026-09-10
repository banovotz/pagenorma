// UI komponente i prikazi glosara
import { dohvatiGlosarIzIndexedDB, dohvatiAnalizuIzIndexedDB } from './glossary.js';
import { findLocalMatches } from '../../services/concordanceService.js';

export async function prikaziGlosarZaProjekt(projektId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const glosar = await dohvatiGlosarIzIndexedDB(projektId);

  const stavke = Array.isArray(glosar)
    ? glosar
    : glosar?.terms || glosar?.items || glosar?.entries || [];

  if (stavke.length === 0) {
    container.innerHTML = '<p class="text-muted">Glosar još nije generiran za ovaj projekt.</p>';
    return;
  }

  let html = `<table class="glosar-tablica" style="width: 100%; border-collapse: collapse;">
    <thead>
      <tr style="border-bottom: 2px solid #008080; text-align: left;">
        <th style="padding: 8px;">Izvorni termin</th>
        <th style="padding: 8px;">Prijevod</th>
        <th style="padding: 8px;">Napomena</th>
      </tr>
    </thead>
    <tbody>`;

  stavke.forEach(item => {
    html += `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px; font-weight: bold;">${item.termin || item.term || item.source_term || '-'}</td>
        <td style="padding: 8px;">${item.prijevod || item.translation || item.primary_translation || '-'}</td>
        <td style="padding: 8px; color: #666;">${item.napomena || item.note || ''}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

/**
 * Otvara modal i dohvaća glosar iz IndexedDB-a ili aktivne analize.
 */
export async function otvoriModalGlosar(targetParam) {
  const modal = document.getElementById('modal-glosar');
  const tbody = document.getElementById('glosar-modal-body');
  const porukaPrazno = document.getElementById('prazan-glosar-poruka');
  const tablica = document.getElementById('tablica-glosara');
  const searchInput = document.getElementById('glossary-search');
  const searchReset = document.getElementById('glossary-search-reset');
  const resultCount = document.getElementById('glossary-result-count');
  const pagination = document.getElementById('glossary-pagination');

  if (!modal || !tbody) return;

  // Ekstrakcija ID-a ako je proslijeđen HTML element (this) ili direktni ID/string
  let projektId = null;
  if (targetParam instanceof HTMLElement) {
    projektId = targetParam.getAttribute('data-projekt-id');
  } else if (typeof targetParam === 'string' || typeof targetParam === 'number') {
    projektId = targetParam;
  }

  // Ako nije prošlijeđen ID, pokušaj dohvatiti iz globalnog stanja
  if (!projektId) {
    projektId = window.trenutniAnalizaId || window.trenutniProjektId;
  }

  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  tbody.innerHTML = '<tr><td colspan="3" class="text-center py-3">Učitavanje glosara...</td></tr>';
  if (searchInput) searchInput.value = '';
  if (resultCount) resultCount.textContent = '';
  if (pagination) pagination.innerHTML = '';
  porukaPrazno.style.display = 'none';
  tablica.style.display = 'table';
  prikaziModalSloj(modal);

  try {
    let rawGlosar = window.trenutniGlosar || window.glosar;
    const analiza = await dohvatiAnalizuIzIndexedDB(projektId);

    // Ako nemamo glosar u memoriji, dohvaćamo ga iz IndexedDB baze za projektId
    if (!rawGlosar || (Array.isArray(rawGlosar) && rawGlosar.length === 0) || Object.keys(rawGlosar).length === 0) {
      if (projektId) {
        rawGlosar = await dohvatiGlosarIzIndexedDB(projektId);
      }
    }

    // NORMALIZACIJA STRUKTURE GLOSARA:
    let podaciZaPrikaz = [];

    if (rawGlosar) {
      if (Array.isArray(rawGlosar)) {
        podaciZaPrikaz = rawGlosar;
      } else if (typeof rawGlosar === 'object') {
        if (Array.isArray(rawGlosar.terms)) {
          podaciZaPrikaz = rawGlosar.terms;
        } else if (Array.isArray(rawGlosar.items)) {
          podaciZaPrikaz = rawGlosar.items;
        } else if (Array.isArray(rawGlosar.entries)) {
          podaciZaPrikaz = rawGlosar.entries;
        } else {
          // Standardni k/v objekt: { "term1": "prijevod1", "term2": "prijevod2" }
          podaciZaPrikaz = Object.entries(rawGlosar);
        }
      }
    }

    if (!podaciZaPrikaz || podaciZaPrikaz.length === 0) {
      porukaPrazno.style.display = 'block';
      tablica.style.display = 'none';
      return;
    }

    const sourceParagraphs = (analiza?.segmenti || []).map(segment => segment.izvor || '');
    const targetParagraphs = (analiza?.segmenti || []).map(segment => segment.prijevod || '');
    const contextCache = new Map();
    const collator = new Intl.Collator('hr', { sensitivity: 'base', numeric: true });
    const entries = podaciZaPrikaz.map((stavka, index) => {
      let izvorTekst = '';
      let prijevodTekst = '';
      let termId = `term-${index}`;

      if (Array.isArray(stavka)) {
        izvorTekst = stavka[0];
        prijevodTekst = stavka[1];
      } else if (typeof stavka === 'object' && stavka !== null) {
        termId = String(stavka.id || termId);
        izvorTekst = stavka.source_term || stavka.izvor || stavka.source || stavka.term || stavka.termin || stavka.original || '';
        prijevodTekst = stavka.primary_translation || stavka.prijevod || stavka.target || stavka.translation || stavka.definition || '';
      }

      if (izvorTekst || prijevodTekst) {
        const contexts = findLocalMatches(
          izvorTekst,
          prijevodTekst,
          sourceParagraphs,
          targetParagraphs
        );
        contextCache.set(termId, contexts);
        return { termId, izvorTekst: String(izvorTekst), prijevodTekst: String(prijevodTekst), contexts };
      }
      return null;
    }).filter(Boolean);

    if (entries.length === 0) {
      porukaPrazno.style.display = 'block';
      tablica.style.display = 'none';
      if (pagination) pagination.innerHTML = '';
      return;
    }

    let sortKey = 'source';
    let sortDirection = 1;
    let currentPage = 1;
    const pageSize = 50;

    const renderPagination = (pageCount) => {
      if (!pagination) return;
      pagination.innerHTML = '';
      if (pageCount <= 1) return;

      for (let page = 1; page <= pageCount; page++) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'glossary-page-button';
        button.textContent = String(page);
        button.setAttribute('aria-label', `Stranica ${page}`);
        if (page === currentPage) {
          button.classList.add('active');
          button.setAttribute('aria-current', 'page');
        }
        button.addEventListener('click', () => {
          currentPage = page;
          render();
        });
        pagination.appendChild(button);
      }
    };

    const render = () => {
      const query = (searchInput?.value || '').trim().toLocaleLowerCase('hr');
      const filtered = query.length >= 3
        ? entries.filter(entry =>
          entry.izvorTekst.toLocaleLowerCase('hr').includes(query) ||
          entry.prijevodTekst.toLocaleLowerCase('hr').includes(query)
        )
        : entries;

      const sorted = [...filtered].sort((left, right) => {
        if (sortKey === 'contexts') {
          return (left.contexts.length - right.contexts.length) * sortDirection ||
            collator.compare(left.izvorTekst, right.izvorTekst);
        }
        const leftValue = sortKey === 'target' ? left.prijevodTekst : left.izvorTekst;
        const rightValue = sortKey === 'target' ? right.prijevodTekst : right.izvorTekst;
        return collator.compare(leftValue, rightValue) * sortDirection;
      });
      const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
      currentPage = Math.min(currentPage, pageCount);
      const pageEntries = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
      tbody.innerHTML = '';

      pageEntries.forEach(entry => {
        const tr = document.createElement('tr');
        tr.className = 'glossary-term-row';
        tr.dataset.termId = entry.termId;
        
        const tdIzvor = document.createElement('td');
        tdIzvor.className = 'fw-bold';
        tdIzvor.textContent = entry.izvorTekst;

        const tdPrijevod = document.createElement('td');
        tdPrijevod.textContent = entry.prijevodTekst;

        const tdAkcija = document.createElement('td');
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'glossary-context-toggle';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = `🔍 ${entry.contexts.length} ${entry.contexts.length === 1 ? 'kontekst' : 'konteksta'}`;
        toggle.addEventListener('click', () => {
          const existing = tr.nextElementSibling?.dataset.contextFor === entry.termId
            ? tr.nextElementSibling
            : null;
          if (existing) {
            existing.remove();
            toggle.setAttribute('aria-expanded', 'false');
            return;
          }

          const contextRow = document.createElement('tr');
          contextRow.dataset.contextFor = entry.termId;
          const contextCell = document.createElement('td');
          contextCell.colSpan = 3;
          contextCell.className = 'glossary-context-cell';
          const items = contextCache.get(entry.termId) || [];
          contextCell.innerHTML = items.length
            ? `<div class="glossary-context-list">${items.map(item => `
                <article class="glossary-context-item">
                  <span class="glossary-context-index">#${item.paragraphIndex + 1}</span>
                  <div><strong>Izvor</strong><p>${item.sourceSnippet}</p></div>
                  <div><strong>Prijevod</strong><p>${item.targetSnippet}</p></div>
                </article>`).join('')}</div>`
            : '<p class="text-muted glossary-context-empty">Nema lokalnih podudaranja u poravnatim odlomcima.</p>';
          contextRow.appendChild(contextCell);
          tr.insertAdjacentElement('afterend', contextRow);
          toggle.setAttribute('aria-expanded', 'true');
        });
        tdAkcija.appendChild(toggle);

        tr.appendChild(tdIzvor);
        tr.appendChild(tdPrijevod);
        tr.appendChild(tdAkcija);
        tbody.appendChild(tr);
      });
      if (resultCount) {
        resultCount.textContent = query.length >= 3
          ? `${filtered.length} pronađenih pojmova`
          : `${entries.length} pojmova`;
      }
      renderPagination(pageCount);
    };

    const sortButtons = document.querySelectorAll('#tablica-glosara .glossary-sort-button');
    sortButtons.forEach(button => {
      button.onclick = () => {
        const nextKey = button.dataset.sort;
        if (sortKey === nextKey) {
          sortDirection *= -1;
        } else {
          sortKey = nextKey;
          sortDirection = 1;
        }
        currentPage = 1;
        render();
      };
    });
    if (searchInput) searchInput.oninput = () => {
      currentPage = 1;
      render();
    };
    if (searchReset) searchReset.onclick = () => {
      if (searchInput) searchInput.value = '';
      currentPage = 1;
      render();
      searchInput?.focus();
    };
    render();

  } catch (err) {
    console.error("Greška pri dohvatu/prikazu glosara:", err);
    tbody.innerHTML = '';
    porukaPrazno.textContent = "Greška pri učitavanju glosara.";
    porukaPrazno.style.display = 'block';
    tablica.style.display = 'none';
  }
}

/**
 * Prikazuje modalne slojeve (backdrop i stilove)
 */
function prikaziModalSloj(modal) {
  let backdrop = document.getElementById('glosar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'glosar-backdrop';
    backdrop.className = 'modal-backdrop fade show';
    document.body.appendChild(backdrop);
  }

  modal.style.display = 'block';
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

/**
 * Zatvara modalni prozor s glosarom.
 */
export function zatvoriModalGlosar() {
  const modal = document.getElementById('modal-glosar');
  const backdrop = document.getElementById('glosar-backdrop');

  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }

  if (backdrop) {
    backdrop.remove();
  }

  document.body.classList.remove('modal-open');
}

// Izlaganje funkcija na globalni window objekt za HTML inline evente (onclick)
window.otvoriModalGlosar = otvoriModalGlosar;
window.zatvoriModalGlosar = zatvoriModalGlosar;

// Zatvaranje modala na tipku ESC
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    zatvoriModalGlosar();
  }
});