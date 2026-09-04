// Prikaz konkordance, paralelnih stupaca i sinhroniziranog skrolanja

import { otvoriBazu, KONKORDANCA_STORE, STORE_NAME } from '../../core/db.js';
import { prikaziStranicu } from '../../core/router.js';

export async function prikaziKonkordancu(projektId) {
 
  // Zaštita od nevažećih ID-ova ili prosljeđivanja neispravnih tipova
  if (!projektId || typeof projektId === 'function') {
    console.warn("prikaziKonkordancu pozvan bez važećeg projektId-a:", projektId);
    return;
  }
  
   window.trenutniProjektId = projektId;

   // 1. Sakrij listu analiza, prikaži kontejner pojedinačne konkordance
  const analizeListContainer = document.getElementById('analize-page');
  const konkordancaContainer = document.getElementById('concordance-page');

  if (analizeListContainer) analizeListContainer.style.display = 'none';
  if (konkordancaContainer) konkordancaContainer.style.display = 'block';

  // Ažuriraj button za glosar
  const btnGlosar = document.querySelector('button[onclick="otvoriModalGlosar(this)"]');
  if (btnGlosar) {
    btnGlosar.setAttribute('data-projekt-id', projektId);
  }

  // 2. Dohvati podatke iz baze i napuni stupce...
  const db = await otvoriBazu();
  const tx = db.transaction(KONKORDANCA_STORE, 'readonly');
  const store = tx.objectStore(KONKORDANCA_STORE);
  
  let rezultat = await new Promise((resolve) => {
    const req = store.get(projektId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });

  const colIzvor = document.getElementById('col-izvor');
  const colPrijevod = document.getElementById('col-prijevod');
  const colKomentari = document.getElementById('col-komentari');

  if (colIzvor && colPrijevod && colKomentari) {
    colIzvor.innerHTML = '';
    colPrijevod.innerHTML = '';
    colKomentari.innerHTML = '';

    if (!rezultat || !rezultat.segmenti || rezultat.segmenti.length === 0) {
      colIzvor.innerHTML = '<p class="text-muted">Nema podataka za prikaz.</p>';
      return;
    }
  



  // Ako je id proslijeđen kao string
  const idKey = typeof projektId === 'string' && !isNaN(projektId) ? Number(projektId) : projektId;
  
  
  prikaziStranicu('concordance-page');

    rezultat.segmenti.forEach((seg, idx) => {
      const pIndex = idx + 1;
      const komentarZaOdlomak = rezultat.komentari 
        ? rezultat.komentari.find(k => k.odlomakIndex === idx) 
        : null;

      const divIzvor = document.createElement('div');
      divIzvor.className = 'segment-item para-box';
      divIzvor.dataset.index = idx;
      divIzvor.innerHTML = `<small style="color:#008080; font-weight:bold;">#${pIndex}</small><br>${seg.izvor || '<em>(Prazno)</em>'}`;
      colIzvor.appendChild(divIzvor);

      const divPrijevod = document.createElement('div');
      divPrijevod.className = 'segment-item para-box';
      divPrijevod.dataset.index = idx;
      divPrijevod.innerHTML = `<small style="color:#2e7d32; font-weight:bold;">#${pIndex}</small><br>${seg.prijevod || '<em>(Prazno)</em>'}`;
      colPrijevod.appendChild(divPrijevod);

      const divKomentar = document.createElement('div');
      divKomentar.className = 'segment-item para-box';
      divKomentar.dataset.index = idx;
      
      if (komentarZaOdlomak && (komentarZaOdlomak.sugestija || komentarZaOdlomak.term)) {
        divKomentar.innerHTML = `
          <div style="background: #f3e5f5; border-left: 3px solid #8e24aa; padding: 6px; border-radius: 4px; font-size: 0.85em;">
            <strong style="color: #8e24aa;">✨ Gemini Napomena #${pIndex}:</strong><br>
            ${komentarZaOdlomak.sugestija || komentarZaOdlomak.term}
          </div>
        `;
      } else {
        divKomentar.innerHTML = `<small style="color:#ccc;">#${pIndex}</small> <span style="color:#eee;">—</span>`;
      }
      colKomentari.appendChild(divKomentar);
    });

    setTimeout(() => {
      const iNodes = colIzvor.querySelectorAll('.para-box');
      const pNodes = colPrijevod.querySelectorAll('.para-box');
      const kNodes = colKomentari.querySelectorAll('.para-box');

      iNodes.forEach((node, idx) => {
        const h1 = node.offsetHeight;
        const h2 = pNodes[idx] ? pNodes[idx].offsetHeight : 0;
        const h3 = kNodes[idx] ? kNodes[idx].offsetHeight : 0;
        const maxHeight = Math.max(h1, h2, h3);

        node.style.minHeight = `${maxHeight}px`;
        if (pNodes[idx]) pNodes[idx].style.minHeight = `${maxHeight}px`;
        if (kNodes[idx]) kNodes[idx].style.minHeight = `${maxHeight}px`;
      });
    }, 50);

    sinkronizirajTrostrukiSkrol(colIzvor, colPrijevod, colKomentari);
  }
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
  // 1. Sakrij kontejner pojedinačne konkordance, prikaži kontejner liste analiza
  const konkordancaContainer = document.getElementById('concordance-page');
  const analizeListContainer = document.getElementById('analize-page');

  if (konkordancaContainer) konkordancaContainer.style.display = 'none';
  if (analizeListContainer) analizeListContainer.style.display = 'block';

  // 2. Učitaj podatke za listu
  await ucitajListuAnaliza();
  await ucitajListuAnaliza();
}

export async function ucitajListuAnaliza() {
  const container = document.getElementById('lista-analiza-container');
  if (!container) return;

  container.innerHTML = '<p class="text-muted">Učitavanje analiza...</p>';

  try {
    const db = await otvoriBazu();

    const txKonkordance = db.transaction(KONKORDANCA_STORE, 'readonly');
    const sveAnalize = await new Promise((res, rej) => {
      const req = txKonkordance.objectStore(KONKORDANCA_STORE).getAll();
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
        <button id="btn-otvori-analizu-${analiza.projektId}" class="btn-primary" style="padding:6px 12px; font-size:0.85em;">Otvorite analizu</button>
        <button id="btn-obrisi-analizu-${analiza.projektId}" class="btn-danger" style="padding:6px 12px; font-size:0.85em; background-color: #d81717a6; color: white; border: none; border-radius: 4px; cursor: pointer;">🗑️ Obriši</button>
      `;

      container.appendChild(card);

      // Listener za otvaranje analize
      document.getElementById(`btn-otvori-analizu-${analiza.projektId}`)?.addEventListener('click', () => {
        prikaziKonkordancu(analiza.projektId);
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
    const tx = db.transaction(KONKORDANCA_STORE, 'readwrite');
    const store = tx.objectStore(KONKORDANCA_STORE);
    
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