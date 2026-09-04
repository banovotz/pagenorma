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
        <td style="padding: 8px; font-weight: bold;">${item.termin || item.term || '-'}</td>
        <td style="padding: 8px;">${item.prijevod || item.translation || '-'}</td>
        <td style="padding: 8px; color: #666;">${item.napomena || item.note || ''}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}