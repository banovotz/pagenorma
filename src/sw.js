const CACHE_NAME = 'mojih1500-v5';
const ASSETS = [
  './',
  './index.html',
  './styles/style.css',
  './app.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

// Instalacija Service Workera i spremanje datoteka u cache
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
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

