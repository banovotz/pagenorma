// UI komponente i prikazi glosara
import { dohvatiGlosarIzIndexedDB } from './glossary.js';

export async function prikaziGlosarZaProjekt(projektId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const glosar = await dohvatiGlosarIzIndexedDB(projektId);

  if (!glosar || glosar.length === 0) {
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

  glosar.forEach(item => {
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
  porukaPrazno.style.display = 'none';
  tablica.style.display = 'table';
  prikaziModalSloj(modal);

  try {
    let rawGlosar = window.trenutniGlosar || window.glosar;

    // Ako nemamo glosar u memoriji, dohvaćamo ga iz IndexedDB baze za projektId
    if (!rawGlosar || (Array.isArray(rawGlosar) && rawGlosar.length === 0) || Object.keys(rawGlosar).length === 0) {
      if (projektId) {
        rawGlosar = await dohvatiGlosarIzIndexedDB(projektId);
      }
    }

    tbody.innerHTML = '';

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

    porukaPrazno.style.display = 'none';
    tablica.style.display = 'table';

    // POPUNJAVANJE REDOVA TABLICE:
    podaciZaPrikaz.forEach((stavka) => {
      let izvorTekst = '';
      let prijevodTekst = '';

      if (Array.isArray(stavka)) {
        izvorTekst = stavka[0];
        prijevodTekst = stavka[1];
      } else if (typeof stavka === 'object' && stavka !== null) {
        izvorTekst = stavka.source_term || stavka.izvor || stavka.source || stavka.term || stavka.termin || stavka.original || '';
        prijevodTekst = stavka.primary_translation || stavka.prijevod || stavka.target || stavka.translation || stavka.definition || '';
      }

      if (izvorTekst || prijevodTekst) {
        const tr = document.createElement('tr');
        
        const tdIzvor = document.createElement('td');
        tdIzvor.className = 'fw-bold';
        tdIzvor.style.padding = '8px';
        tdIzvor.textContent = izvorTekst;

        const tdPrijevod = document.createElement('td');
        tdPrijevod.style.padding = '8px';
        tdPrijevod.textContent = prijevodTekst;

        const tdAkcija = document.createElement('td');
        tdAkcija.style.padding = '8px';

        tr.appendChild(tdIzvor);
        tr.appendChild(tdPrijevod);
        tr.appendChild(tdAkcija);
        tbody.appendChild(tr);
      }
    });

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