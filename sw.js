const CACHE_NAME = 'mojih1500-v9';
const  ASSETS_TO_CACHE = [
  './',
  './index.html',
  './src/styles/style.css',
  './manifest.json',
  './public/icons/icon-192.png',
  './public/icons/icon-512.png',
  './public/icons/apple-splash.png',
  './src/app.js',
  './src/core/db.js',
  './src/core/router.js',
  './src/core/state.js',
  './src/features/settings/settings.ui.js',
  './src/features/projects/projects.ui.js',
  './src/features/projects/projects.js',
  './src/features/epub-parser/epub.parser.js',
  './src/features/pdf-parser/pdf.parser.js',
  './src/features/google-drive/drive.auth.js',
  './src/features/google-drive/drive.api.js',
  './src/features/glossary/glossary.ui.js',
  './src/features/glossary/glossary.js',
  './src/features/interlinear/interlinear.ui.js',
  './src/features/interlinear/interlinear.js',
  './src/features/analytics/analytics.ui.js',
  './src/components/modal.js',
  './src/components/toast.js'

];

// Instalacija Service Workera i spremanje datoteka u cache
self.addEventListener('install', (event) => {
  // Ne čekaj da se stare kartice zatvore - odmah pređi u "waiting to activate"
  // i potakni odmah preuzimanje kontrole (vidi 'activate' niže).
  self.skipWaiting();

  event.waitUntil(
    // KLJUČNO: koristiti ISTI CACHE_NAME koji se provjerava i briše u 'activate',
    // inače se nova verzija sprema u drugi cache, a 'activate' briše sve OSIM
    // trenutnog CACHE_NAME (pa je efektivno brisao upravo ono što je 'install' napunio).
    caches.open(CACHE_NAME).then(async (cache) => {
      // Umjesto cache.addAll(ASSETS_TO_CACHE):
      await Promise.allSettled(
        ASSETS_TO_CACHE.map(async (url) => {
          try {
            // 'reload' osigurava da i sam install dohvati svježe datoteke s mreže,
            // a ne stariju verziju koju je eventualno već keširao browser HTTP cache.
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) {
              await cache.put(url, response);
            } else {
              console.warn(`[ServiceWorker] Datoteka nije pronađena (404): ${url}`);
            }
          } catch (err) {
            console.warn(`[ServiceWorker] Greška pri dohvaćanju: ${url}`, err);
          }
        })
      );
    })
  );
});

// Aktivacija, čišćenje starih verzija cachea i PREUZIMANJE KONTROLE nad otvorenim karticama
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      ))
      // Bez ovoga nova SW verzija ostaje "activated" ali ne kontrolira već otvorene
      // kartice/instalirani PWA sve dok se ručno ne zatvore - pa korisnik i dalje
      // vidi stari JS iako je nova verzija tehnički aktivna.
      .then(() => self.clients.claim())
  );
});

// Dohvaćanje resursa: Prvo traži u Cacheu, ako nema - ide na Mrežu.
// Za HTML navigacije (npr. učitavanje/refresh same app) koristimo network-first
// s cache fallbackom, kako bi korisnik čim prije dobio najnoviju ljusku aplikacije
// (a ne zauvijek staru index.html iz cachea dok ga SW jednom ne osvježi).
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

    // Application modules must be refreshed from the network so security fixes
  // cannot remain hidden behind an older service-worker cache.
  if (new URL(e.request.url).pathname.endsWith('.js')) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});

let trenutniProjektId = null; // ID projekta kojem dodajemo unos
