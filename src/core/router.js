// ============================================================================
// JEDINSTVENI ROUTER - konsolidacija bivših core/router.js i ui/navigation.js
// ============================================================================
//
// Zašto je konsolidacija bila potrebna:
// Ranije su postojala DVA nezavisna, međusobno "nesvjesna" sustava:
//   - ui/navigation.js je sakrivao/prikazivao CIJELE <section class="page-section">
//     (dashboard, analitika, translation-analytics, postavke), ali NIJE dirao
//     browser history niti URL hash.
//   - core/router.js je sakrivao/prikazivao POJEDINAČNE .page-content div-ove
//     UNUTAR tih sekcija, i upravljao je history/hash-om (gumb Natrag), ali
//     nije znao ništa o razini .page-section.
// Budući da razne funkcije nisu mogle znati koji je od ta dva sloja "nadležan",
// znalo se dogoditi da se sadržaj popuni i prikaže (display:block) UNUTAR
// sekcije koja je i dalje ostala sakrivena na .page-section razini (prazan
// ekran nakon LLM analize), ili da klik na navigaciju uopće ne upiše ništa
// u history (gumb Natrag nije imao što vratiti).
//
// Ovaj modul tretira "rutu" kao JEDNU cjelinu koja uključuje OBJE razine
// (section + view) te history/hash, tako da više ne postoji prostor za
// nesklad između njih. Ne poznaje nikakvu poslovnu logiku (dashboard,
// analitika...) - rute se registriraju izvana (vidi registerRoutes), obično
// jednom pri pokretanju aplikacije u app.js.

const routes = new Map();
let defaultRouteKey = 'dashboard';

/**
 * Registrira rute. Svaki unos u routeMap je oblika:
 *   'kljucRute': {
 *     section: 'id-sekcije',   // <section class="page-section"> koji treba prikazati
 *     view: 'id-sadrzaja',     // .page-content UNUTAR te sekcije koji treba prikazati
 *     onEnter(params) { ... }  // (opcionalno) poziva se pri svakom ulasku u rutu
 *   }
 *
 * Ključ rute smije sadržavati '/' za pod-rute istog "zaslova" - npr.
 * 'translation-analytics' (lista analiza) i
 * 'translation-analytics/interlinear' (pojedina otvorena analiza) dijele
 * istu section, ali imaju različiti view i različit onEnter.
 */
export function registerRoutes(routeMap, options = {}) {
  Object.entries(routeMap).forEach(([key, config]) => routes.set(key, config));
  if (options.defaultRoute) defaultRouteKey = options.defaultRoute;
}

// Pretvara URL hash (npr. '#translation-analytics/interlinear/proj_123') u
// { routeKey, params }. Traži najdulje poklapanje registrirane rute, a
// preostali dio hasha (ako postoji) tumači kao projektId parametar.
function parsirajHash(hash) {
  const cisti = (hash || '').replace(/^#/, '');
  if (!cisti) return { routeKey: defaultRouteKey, params: {} };

  const dijelovi = cisti.split('/').filter(Boolean);

  for (let duljina = dijelovi.length; duljina >= 1; duljina--) {
    const kandidatKey = dijelovi.slice(0, duljina).join('/');
    if (routes.has(kandidatKey)) {
      const ostatak = dijelovi.slice(duljina);
      return { routeKey: kandidatKey, params: ostatak[0] ? { projektId: ostatak[0] } : {} };
    }

  }

  return { routeKey: defaultRouteKey, params: {} };
}

function parsirajTrenutniURL() {
  if (window.location.hash) return parsirajHash(window.location.hash);
  const path = window.location.pathname.replace(/\/+$/, '');
  for (const routeKey of routes.keys()) {
    if (path.endsWith(`/${routeKey}`)) return { routeKey, params: {} };
  }
  return { routeKey: defaultRouteKey, params: {} };
}

function izgradiHash(routeKey, params = {}) {
  let hash = '#' + routeKey;
  if (params && params.projektId !== undefined && params.projektId !== null) {
    hash += '/' + params.projektId;
  }
  return hash;
}

// Jedino mjesto u aplikaciji koje dira vidljivost stranica: sakrije SVE
// .page-section i SVE .page-content, zatim prikaže TOČNO section+view koji
// pripadaju traženoj ruti. Time je nemoguće da sadržaj ostane "zarobljen"
// unutar skrivene roditeljske sekcije, jer se obje razine mijenjaju zajedno,
// atomarno, na jednom mjestu.
function primijeniPrikaz(routeKey) {
  const route = routes.get(routeKey);
  if (!route) {
    console.warn(`Ruta "${routeKey}" nije registrirana.`);
    return;
  }

  document.querySelectorAll('.page-section').forEach(sec => {
    sec.classList.add('hidden');
    sec.style.setProperty('display', 'none', 'important');
  });

  document.querySelectorAll('.page-content').forEach(content => {
    content.style.display = 'none';
  });

  const sekcija = document.getElementById(route.section);
  if (sekcija) {
    sekcija.classList.remove('hidden');
    sekcija.style.setProperty('display', 'block', 'important');
  }

  const prikaz = document.getElementById(route.view);
  if (prikaz) {
    prikaz.style.display = 'block';
  }

  // Isticanje u navigaciji: i 'translation-analytics' i
  // 'translation-analytics/interlinear' ističu isti nav link
  // ("🌐 Translation Analytics"), zato uzimamo samo prvi dio ključa rute.
  const glavniDioRute = routeKey.split('/')[0];
  document.querySelectorAll('[data-target]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-target') === glavniDioRute);
  });

  window.scrollTo(0, 0);
}

/**
 * Glavna, jedina funkcija za navigaciju u aplikaciji - poziva se i iz klika na
 * navigaciju, i programatski iz poslovne logike (npr. otvaranje pojedine
 * analize nakon završetka LLM obrade), i iz popstate handlera kad korisnik
 * koristi gumb Natrag/Naprijed (tada s pushState:false, da se ne dodaje novi
 * zapis u povijest za nešto što povijest već sadrži).
 */
export function navigirajNa(routeKey, params = {}, { pushState = true } = {}) {
  if (!routes.has(routeKey)) {
    console.warn(`Ruta "${routeKey}" nije definirana.`);
    return;
  }

  primijeniPrikaz(routeKey);

  if (pushState) {
    const noviHash = izgradiHash(routeKey, params);
    if (window.location.hash !== noviHash) {
      history.pushState({ routeKey, params }, '', noviHash);
    }
  }

  const route = routes.get(routeKey);
  if (typeof route.onEnter === 'function') {
    route.onEnter(params);
  }
}

/**
 * Jednokratna inicijalizacija routera - poziva se TOČNO JEDNOM pri pokretanju
 * aplikacije (nakon registerRoutes). Postavlja:
 *  1. popstate listener - reagira na gumb Natrag/Naprijed preglednika.
 *  2. delegirano slušanje klikova na sve [data-target] navigacijske elemente.
 *  3. početni prikaz prema trenutnom URL hashu (ili zadanoj ruti ako hasha nema).
 */
export function initRouter() {
  window.addEventListener('popstate', (event) => {
    if (event.state && event.state.routeKey) {
      navigirajNa(event.state.routeKey, event.state.params || {}, { pushState: false });
    } else {
      const { routeKey, params } = parsirajTrenutniURL();
      navigirajNa(routeKey, params, { pushState: false });
    }
  });

  const navContainer = document.getElementById('main-nav') || document.body;
  navContainer.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-target]');
    if (!btn) return;
    event.preventDefault();
    navigirajNa(btn.getAttribute('data-target'), {});
  });

  const { routeKey, params } = parsirajTrenutniURL();
  // replaceState (ne pushState) za početno stanje - ne želimo da prvi ekran
  // koji korisnik vidi stvori dodatni "prazan" korak u povijesti.
  history.replaceState({ routeKey, params }, '', izgradiHash(routeKey, params));
  primijeniPrikaz(routeKey);

  const route = routes.get(routeKey);
  if (route && typeof route.onEnter === 'function') {
    route.onEnter(params);
  }
}

// ----------------------------------------------------------------------------
// Pomoćne UI funkcije (bočni izbornik i modal glosara) - premještene iz
// bivšeg src/ui/navigation.js radi konsolidacije svega vezanog uz navigaciju
// u jedan modul.
// ----------------------------------------------------------------------------

export function toggleMenu() {
  const sideDrawer = document.getElementById('side-drawer');
  const overlay = document.getElementById('overlay');

  if (sideDrawer && overlay) {
    sideDrawer.classList.toggle('open');
    overlay.classList.toggle('active');
  }
}

/**
 * Otvara modal i dohvaća glosar iz IndexedDB-a ili aktivne analize.
 */
async function otvoriModalGlosar(projektId) {
  const modal = document.getElementById('modal-glosar');
  const tbody = document.getElementById('glosar-modal-body');
  const porukaPrazno = document.getElementById('prazan-glosar-poruka');
  const tablica = document.getElementById('tablica-glosara');

  if (!modal || !tbody) return;

  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  tbody.innerHTML = '<tr><td colspan="2" class="text-center py-3">Učitavanje glosara...</td></tr>';
  porukaPrazno.style.display = 'none';
  tablica.style.display = 'table';
  prikaziModalSloj(modal);

  try {
    let rawGlosar = window.trenutniGlosar || window.glosar;

    if (!rawGlosar || Object.keys(rawGlosar).length === 0) {
    if (projektId) {
      rawGlosar = await dohvatiGlosarIzIndexedDB(projektId);
    }
  }

    tbody.innerHTML = '';

    // NORMALIACIJA STRUKTURE GLOSARA:
    // Rukuje slučajevima ako je glosar objekt s ključem 'terms', 'items', 'entries' ili obavezni niz/objekt
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
        // Format [ "Izvor", "Prijevod" ] iz Object.entries()
        izvorTekst = stavka[0];
        prijevodTekst = stavka[1];
      } else if (typeof stavka === 'object' && stavka !== null) {
        // Dodani su ključevi koje vraća stvoriGlosar(): source_term i primary_translation
        izvorTekst = stavka.source_term || stavka.izvor || stavka.source || stavka.term || stavka.original || '';
        prijevodTekst = stavka.primary_translation || stavka.prijevod || stavka.target || stavka.translation || stavka.definition || '';
      }

      if (izvorTekst || prijevodTekst) {
        const tr = document.createElement('tr');
        
        const tdIzvor = document.createElement('td');
        tdIzvor.className = 'fw-bold';
        tdIzvor.textContent = izvorTekst;

        const tdPrijevod = document.createElement('td');
        tdPrijevod.textContent = prijevodTekst;

        tr.appendChild(tdIzvor);
        tr.appendChild(tdPrijevod);
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

export function zatvoriModalGlosar() {
  const modal = document.getElementById('glosar-modal') || document.getElementById('modal-glosar');
  const backdrop = document.getElementById('glosar-backdrop');

  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }

  backdrop?.remove();
  document.body.classList.remove('modal-open');
}
