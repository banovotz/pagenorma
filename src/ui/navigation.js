/**
 * Modul za upravljanje navigacijom i modalnim prozorima
 */

/**
 * Otvara ili zatvara mobilni/bočni navigacijski izbornik.
 */
export function toggleMenu() {
  const navMenu = document.getElementById('nav-menu') || document.querySelector('.nav-menu') || document.querySelector('nav');
  if (navMenu) {
    navMenu.classList.toggle('active');
    navMenu.classList.toggle('open');
  }
}

/**
 * Otvara modalni prozor za glosar i postavlja prikaz na vidljivo.
 */
export function otvoriModalGlosar() {
  const modal = document.getElementById('glosar-modal') || document.getElementById('modal-glosar');
  if (modal) {
    modal.style.display = 'block';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }
}

/**
 * Zatvara modalni prozor za glosar.
 */
export function zatvoriModalGlosar() {
  const modal = document.getElementById('glosar-modal') || document.getElementById('modal-glosar');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Inicijalizira event listenere za navigaciju i zatvaranje modala na klik izvan njega ili tipkom Escape.
 */
export function inicijalizirajNavigacijuUI() {
  const menuToggleBtn = document.getElementById('menu-toggle') || document.querySelector('.menu-toggle');
  if (menuToggleBtn) {
    menuToggleBtn.addEventListener('click', toggleMenu);
  }

  const btnZatvoriGlosar = document.getElementById('zatvori-glosar-btn') || document.querySelector('.close-glosar');
  if (btnZatvoriGlosar) {
    btnZatvoriGlosar.addEventListener('click', zatvoriModalGlosar);
  }

  // Zatvaranje modala klikom na pozadinu (backdrop) ili priskom na ESC
  window.addEventListener('click', (event) => {
    const modal = document.getElementById('glosar-modal') || document.getElementById('modal-glosar');
    if (modal && event.target === modal) {
      zatvoriModalGlosar();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      zatvoriModalGlosar();
    }
  });
}