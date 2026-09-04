/**
 * Modul za upravljanje navigacijom i usmjeravanjem (Routing)
 */

import { ucitajAnalitiku } from '../features/analytics/analytics.ui.js';
import { ucitajPostavke } from '../features/settings/settings.ui.js';
import { prikaziSveAnalize } from '../features/concordance/concordance.ui.js'; 


// Centralni registar ruta i pripadajućih akcija/handlera
const routes = {
  'dashboard': {
    sectionId: 'page-dashboard',
    onActivate: null
  },
  'financial-analytics': {
    sectionId: 'page-analytics',
    onActivate: (dohvatiSveProjekteFn) => ucitajAnalitiku(dohvatiSveProjekteFn)
  },
  'translation-analytics': {
    sectionId: 'page-translation-analytics',
    onActivate: () => prikaziSveAnalize() 
  },
  'settings': {
    sectionId: 'page-settings',
    onActivate: () => ucitajPostavke()
  }
};

/**
 * Prebacuje prikaz na zadanu stranicu prema target ID-u
 */
export function navigirajNa(target, contextData = null) {
  const route = routes[target];
  
  if (!route) {
    console.warn(`Ruta "${target}" nije definirana.`);
    return;
  }

  // 1. Sakrij sve sekcije
  document.querySelectorAll('.page-section').forEach(sec => {
    sec.classList.add('hidden');
    sec.style.setProperty('display', 'none', 'important');
  });

  // 2. Prikaži odabranu sekciju
  const targetSection = document.getElementById(route.sectionId);
  if (targetSection) {
    targetSection.classList.remove('hidden');
    targetSection.style.setProperty('display', 'block', 'important');
  }

  // 3. Ažuriraj aktivno stanje gumba u navigaciji
  document.querySelectorAll('[data-target]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-target') === target);
  });

  // 4. Pokreni pridruženu funkciju
  if (typeof route.onActivate === 'function') {
    route.onActivate(contextData);
  }
}


/**
 * Inicijalizira event delegaciju za navigaciju
 */
export function inicijalizirajNavigaciju(dohvatiSveProjekteFn) {
  const navContainer = document.getElementById('main-nav') || document.body;

  navContainer.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-target]');
    if (!btn) return;

    event.preventDefault();
    const target = btn.getAttribute('data-target');
    
    navigirajNa(target, dohvatiSveProjekteFn);
  });
}

// --- MODAL GLOSAR & MENU LOGIKA ---

export function toggleMenu() {
  const navMenu = document.getElementById('nav-menu');
  if (navMenu) {
    navMenu.classList.toggle('open');
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