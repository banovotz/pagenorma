/**
 * Modul za financijsku analitiku i postavke obračuna
 */

const SETTINGS_KEY = 'mojih1500_postavke';

// --- POMOĆNE MATEMATIČKE FUNKCIJE I IZRAČUNI ---

/**
 * Izračunava broj radnih dana između dva datuma uz opciju rada vikendom.
 */
export function izracunajRadneDane(pocetak, kraj, radVikendom) {
  let d = new Date(pocetak);
  const krajDate = new Date(kraj);
  let count = 0;

  while (d <= krajDate) {
    const dayOfWeek = d.getDay();
    if (radVikendom || (dayOfWeek !== 0 && dayOfWeek !== 6)) {
      count++;
    }
    d.setDate(d.getDate() + 1);
  }
  return Math.max(1, count);
}

/**
 * Izračunava preostale dane i potreban dnevni ritam (kartica/dan) do roka.
 */
export function izracunajRitamIRok(p) {
  if (!p.rok && !p.datumRoka) return { preostaloDana: 0, potrebnoDnevno: 0 };

  const datumRokaStr = p.rok || p.datumRoka;
  const danas = new Date();
  danas.setHours(0, 0, 0, 0);

  const rokDatum = new Date(datumRokaStr);
  rokDatum.setHours(0, 0, 0, 0);

  const diffTime = rokDatum - danas;
  const ukupanBrojDana = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  let radniDani = ukupanBrojDana;
  const radVikendom = p.vikend || p.radVikendom;

  if (radVikendom === 'ne') {
    radniDani = 0;
    let tempDate = new Date(danas);
    while (tempDate <= rokDatum) {
      const dayOfWeek = tempDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { 
        radniDani++;
      }
      tempDate.setDate(tempDate.getDate() + 1);
    }
    radniDani = Math.max(1, radniDani);
  }

  const ukupno = parseFloat(p.ukupno || p.ukupnoKartica) || 0;
  const odradjeno = parseFloat(p.odradjeno || p.odradjenoKartica) || 0;
  const preostaloKartica = Math.max(0, ukupno - odradjeno);
  const potrebnoDnevno = (preostaloKartica / radniDani).toFixed(1);

  return {
    preostaloDana: radniDani,
    potrebnoDnevno: potrebnoDnevno
  };
}

/**
 * Izračunava preostale radne/kalendarske dane do roka.
 */
export function izracunajPreostaleDane(datumRokaStr, radVikendom) {
  const danas = new Date();
  danas.setHours(0, 0, 0, 0);

  const rok = new Date(datumRokaStr);
  rok.setHours(0, 0, 0, 0);

  if (rok < danas) return 0;

  let preostaloDana = 0;
  let tekuciDatum = new Date(danas);

  while (tekuciDatum <= rok) {
    const danUTjednu = tekuciDatum.getDay();
    const jeVikend = (danUTjednu === 0 || danUTjednu === 6);

    if (radVikendom === 'da' || !jeVikend) {
      preostaloDana++;
    }
    tekuciDatum.setDate(tekuciDatum.getDate() + 1);
  }

  return preostaloDana;
}

// --- UPRAVLJANJE POSTAVKAMA FINANCIJA ---

export function ucitajPostavke(prikaziStranicuCallback) {
  if (typeof prikaziStranicuCallback === 'function') {
    prikaziStranicuCallback('settings-page');
  }

  const postojacePostavke = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {
    modelDoprinosa: 'obrt',
    fiksniIznos: 0,
    postotakIznos: 0,
    vrstaKartice: '1800'
  };

  const elPostotak = document.getElementById('model-postotak');
  const elObrt = document.getElementById('model-obrt');

  if (elPostotak && elObrt) {
    if (postojacePostavke.modelDoprinosa === 'postotak') {
      elPostotak.checked = true;
    } else {
      elObrt.checked = true;
    }
  }

  const elFiksni = document.getElementById('fiksni-iznos');
  const elPostotakIznos = document.getElementById('postotak-iznos');
  const elKartica1800 = document.getElementById('kartica-1800');

  if (elFiksni) elFiksni.value = postojacePostavke.fiksniIznos || '';
  if (elPostotakIznos) elPostotakIznos.value = postojacePostavke.postotakIznos || '';
  if (elKartica1800) elKartica1800.checked = true;

  osvjeziPrikazFinancija();
}

export function osvjeziPrikazFinancija() {
  const modelObrtEl = document.getElementById('model-obrt');
  if (!modelObrtEl) return;

  const isObrt = modelObrtEl.checked;
  const poljeFiksni = document.getElementById('polje-fiksni');
  const poljePostotak = document.getElementById('polje-postotak');

  if (poljeFiksni) poljeFiksni.style.display = isObrt ? 'block' : 'none';
  if (poljePostotak) poljePostotak.style.display = isObrt ? 'none' : 'block';
}

export function spremiPostavke() {
  const modelDoprinosa = document.querySelector('input[name="modelDoprinosa"]:checked')?.value || 'obrt';
  const fiksniIznos = parseFloat(document.getElementById('fiksni-iznos')?.value) || 0;
  const postotakIznos = parseFloat(document.getElementById('postotak-iznos')?.value) || 0;
  const vrstaKartice = document.querySelector('input[name="vrstaKartice"]:checked')?.value || '1800';

  const postavke = {
    modelDoprinosa,
    fiksniIznos,
    postotakIznos,
    vrstaKartice
  };

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(postavke));
  alert('Settings saved successfully!');
}

// --- GENERIRANJE TABLICE I TABLIČNE ANALITIKE ---

let odabranaGodinaAnalitike = new Date().getFullYear();

export async function ucitajAnalitiku(dohvatiSveProjekteFn, prikaziStranicuCallback) {
  if (typeof prikaziStranicuCallback === 'function') {
    prikaziStranicuCallback('analytics-page');
  }
  popuniGodineOdabira();
  await generirajTablicuAnalitike(dohvatiSveProjekteFn);
}

export function popuniGodineOdabira() {
  const select = document.getElementById('odabir-godine');
  if (!select) return;
  select.innerHTML = '';
  
  const trenutnaGodina = new Date().getFullYear();
  for (let g = trenutnaGodina - 2; g <= trenutnaGodina + 2; g++) {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = `Year ${g}`;
    if (g === odabranaGodinaAnalitike) opt.selected = true;
    select.appendChild(opt);
  }
}

export async function promijeniGodinuAnalitike(dohvatiSveProjekteFn) {
  const select = document.getElementById('odabir-godine');
  if (select) {
    odabranaGodinaAnalitike = parseInt(select.value, 10);
  }
  await generirajTablicuAnalitike(dohvatiSveProjekteFn);
}

export async function generirajTablicuAnalitike(dohvatiSveProjekteFn) {
  const tbody = document.getElementById('analitika-tablica-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const sirovoPostavke = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  const postavke = {
    modelDoprinosa: sirovoPostavke.modelDoprinosa || 'obrt',
    fiksniIznos: parseFloat(sirovoPostavke.fiksniIznos) || 0,
    postotakIznos: parseFloat(sirovoPostavke.postotakIznos) || 0,
    vrstaKartice: parseInt(sirovoPostavke.vrstaKartice, 10) || 1800
  };

  const sviProjekti = typeof dohvatiSveProjekteFn === 'function' ? await dohvatiSveProjekteFn() : [];

  const naziviMjeseci = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  let godisnjiNetoUkupno = 0;
  const danas = new Date();

  for (let m = 0; m < 12; m++) {
    const aktivniProjektiUMjesecu = [];

    sviProjekti.forEach(p => {
      const datumPocetka = p.datumPocetka ? new Date(p.datumPocetka) : new Date(p.datumKreiranja || Date.now());
      const datumRoka = new Date(p.datumRoka);

      const pocetakMjeseca = new Date(odabranaGodinaAnalitike, m, 1);
      const krajMjeseca = new Date(odabranaGodinaAnalitike, m + 1, 0);

      if (datumPocetka <= krajMjeseca && datumRoka >= pocetakMjeseca) {

        const jeZavrsetakProjekta = (datumRoka.getFullYear() === odabranaGodinaAnalitike && datumRoka.getMonth() === m);

        const norma = postavke.vrstaKartice || 1800;
        let ukupnoZnakovaOdradjeno = 0;

        const unosiDnevnika = p.dnevnik || p.logs || p.povijest || [];
        if (Array.isArray(unosiDnevnika) && unosiDnevnika.length > 0) {
          ukupnoZnakovaOdradjeno = unosiDnevnika.reduce((sum, u) => sum + (parseFloat(u.brojZnakova || u.znakova || u.iznos) || 0), 0);
        } else {
          ukupnoZnakovaOdradjeno = parseFloat(p.slovaPrijevod || p.slovaOriginal || p.odradjenoZnakova || p.trenutnoZnakova) || 0;
        }

        let odradjenoKartica = ukupnoZnakovaOdradjeno / norma;

        if (odradjenoKartica === 0) {
          odradjenoKartica = parseFloat(p.ukupnoKartica) || parseFloat(p.odradjenoKartica) || 0;
        }

        const cijenaPoKartici = parseFloat(p.honorarPoKartici || p.cijenaPoKartici || p.cijena) || 0;
        
        let trenutnoBruto = odradjenoKartica * cijenaPoKartici;
        if (trenutnoBruto === 0 && p.ukupnoBruto) {
          trenutnoBruto = parseFloat(p.ukupnoBruto) || 0;
        }

        let kasni = false;
        const ukupnoKartica = parseFloat(p.ukupnoKartica) || 0;
        if (datumRoka < danas && (ukupnoKartica === 0 || odradjenoKartica < ukupnoKartica)) {
          kasni = true;
        }

        const nazivKlijenta = p.klijent || p.izdavac || p.narucitelj || '-';

        aktivniProjektiUMjesecu.push({
          naslov: p.naslov || p.naziv || 'Unnamed project',
          izdavac: nazivKlijenta,
          bruto: trenutnoBruto,
          kasni: kasni,
          jeZavrsetakProjekta: jeZavrsetakProjekta
        });
      }
    });

    const imeMjeseca = naziviMjeseci[m];
    const zavrseniUOvomMjesecu = aktivniProjektiUMjesecu.filter(p => p.jeZavrsetakProjekta);
    const mjesecniBrutoZavrsenih = zavrseniUOvomMjesecu.reduce((sum, item) => sum + item.bruto, 0);

    let mjesecniNetoObrt = 0;
    if (postavke.modelDoprinosa === 'obrt') {
      if (zavrseniUOvomMjesecu.length > 0) {
        mjesecniNetoObrt = mjesecniBrutoZavrsenih - postavke.fiksniIznos;
      } else {
        mjesecniNetoObrt = 0;
      }
      godisnjiNetoUkupno += mjesecniNetoObrt;
    }

    if (aktivniProjektiUMjesecu.length === 0) {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #eee';
      tr.innerHTML = `
        <td style="padding: 10px 12px; font-weight: bold; color: #555;">${imeMjeseca}</td>
        <td style="padding: 10px 12px; color: #aaa;" colspan="2"><em>No active projects</em></td>
        <td style="padding: 10px 12px; text-align: right; color: #aaa;">€0.00</td>
        <td style="padding: 10px 12px; color: #aaa;">-</td>
      `;
      tbody.appendChild(tr);
    } else {
      aktivniProjektiUMjesecu.forEach((proj, idx) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #eee';

        const ukupnoRedovaUMjesecu = postavke.modelDoprinosa === 'obrt' 
          ? aktivniProjektiUMjesecu.length + 1 
          : aktivniProjektiUMjesecu.length;

        let tdMjesec = idx === 0 
          ? `<td rowspan="${ukupnoRedovaUMjesecu}" style="padding: 10px 12px; font-weight: bold; color: #333; vertical-align: top; background: #fafafa;">${imeMjeseca}</td>` 
          : '';

        let tdProjekt = `<td style="padding: 10px 12px; font-weight: 500;">${proj.naslov}</td>`;
        let tdIzdavac = `<td style="padding: 10px 12px; color: #666;">${proj.izdavac}</td>`;

        let tdNeto = '';

        if (postavke.modelDoprinosa === 'obrt') {
          if (proj.jeZavrsetakProjekta) {
            tdNeto = `<td style="padding: 10px 12px; text-align: right; font-weight: 500; color: #333;">
              €${proj.bruto.toFixed(2)}
            </td>`;
          } else {
            tdNeto = `<td style="padding: 10px 12px; text-align: right; color: #888; font-style: italic;">
              n/a
            </td>`;
          }
        } else {
          if (proj.jeZavrsetakProjekta) {
            const stopaDoprinosa = (postavke.postotakIznos || 0) / 100;
            const projNeto = proj.bruto * (1 - stopaDoprinosa);
            godisnjiNetoUkupno += projNeto;

            tdNeto = `<td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #2e7d32;">
              €${projNeto.toFixed(2)}
            </td>`;
          } else {
            tdNeto = `<td style="padding: 10px 12px; text-align: right; color: #888; font-style: italic;">
              n/a
            </td>`;
          }
        }

        let opaskaHtml = proj.kasni 
          ? `<span style="color: #c62828; font-weight: bold; background: #fde8e8; padding: 2px 6px; border-radius: 4px; font-size: 0.85em;">⚠️ Project delayed</span>`
          : `<span style="color: #2e7d32; font-size: 0.85em;">On schedule</span>`;

        let tdOpaska = `<td style="padding: 10px 12px;">${opaskaHtml}</td>`;

        tr.innerHTML = tdMjesec + tdProjekt + tdIzdavac + tdNeto + tdOpaska;
        tbody.appendChild(tr);
      });

      if (postavke.modelDoprinosa === 'obrt') {
        const trSuma = document.createElement('tr');
        trSuma.style.background = '#f9fbe7';
        trSuma.style.borderBottom = '2px solid #e0e0e0';

        const opisPrikaz = zavrseniUOvomMjesecu.length > 0 
          ? `<em>Total net for ${imeMjeseca} (after -€${postavke.fiksniIznos.toFixed(2)} contributions)</em>`
          : `<em>No projects completed this month</em>`;

        const iznosBoja = mjesecniNetoObrt >= 0 ? '#2e7d32' : '#c62828';
        const iznosPrikaz = zavrseniUOvomMjesecu.length > 0 ? `€${mjesecniNetoObrt.toFixed(2)}` : '€0.00';

        trSuma.innerHTML = `
          <td colspan="2" style="padding: 8px 12px; font-size: 0.88em; color: #555;">${opisPrikaz}</td>
          <td style="padding: 8px 12px; text-align: right; font-weight: bold; color: ${iznosBoja};">${iznosPrikaz}</td>
          <td style="padding: 8px 12px; font-size: 0.82em; color: #757575; font-style: italic;">Fixed monthly contributions applied</td>
        `;
        tbody.appendChild(trSuma);
      }
    }
  }

  const ukupnoEl = document.getElementById('analitika-ukupno-neto');
  if (ukupnoEl) {
    ukupnoEl.textContent = `€${godisnjiNetoUkupno.toFixed(2)}`;
  }
}

