const CACHE_NAME = 'mojih1500-v6';
const  ASSETS_TO_CACHE = [
  './',
  './index.html',
  './src/styles/style.css',
  './manifest.json',
  './public/icons/icon-192.png',
  './public/icons/icon-512.png',
  './public/icons/apple-splash.png',
  './src/app.js',
  './src/ui/navigation.js',
  './src/core/db.js',
  './src/core/router.js',
  './src/core/state.js',
  './src/features/settings/settings.ui.js',
  './src/features/projects/projects.ui.js',
  './src/features/projects/projects.js',
  './src/features/epub-parser/epub.parser.js',
  './src/features/google-drive/drive.auth.js',
  './src/features/google-drive/drive.api.js',
  './src/features/glossary/glossary.ui.js',
  './src/features/glossary/glossary.js',
  './src/features/concordance/concordance.ui.js',
  './src/features/concordance/concordance.js',
  './src/features/analytics/analytics.ui.js',
  './src/components/modal.js',
  './src/components/toast.js'

];

// Instalacija Service Workera i spremanje datoteka u cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('mojih1500-cache-v1').then(async (cache) => {
      // Umjesto cache.addAll(ASSETS_TO_CACHE):
      await Promise.allSettled(
        ASSETS_TO_CACHE.map(async (url) => {
          try {
            const response = await fetch(url);
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

// Aktivacija i čišćenje starih verzija cachea
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// Dohvaćanje resursa: Prvo traži u Cacheu, ako nema - ide na Mrežu
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});

let trenutniProjektId = null; // ID projekta kojem dodajemo unos

