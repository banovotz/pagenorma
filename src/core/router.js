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
      const { routeKey, params } = parsirajHash(window.location.hash);
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

  const { routeKey, params } = parsirajHash(window.location.hash);
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

export function otvoriModalGlosar() {
  const modal = document.getElementById('glosar-modal') || document.getElementById('modal-glosar');
  if (modal) {
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
  }
}

export function zatvoriModalGlosar() {
  const modal = document.getElementById('glosar-modal') || document.getElementById('modal-glosar');
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
}
