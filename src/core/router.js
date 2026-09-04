// Upravljanje navigacijom i prikazom stranica

export function prikaziStranicu(pageId) {
  const sveStranice = document.querySelectorAll('.page-content');
  
  sveStranice.forEach(page => {
    page.style.display = 'none';
  });

  const trazenaStranica = document.getElementById(pageId);
  if (trazenaStranica) {
    trazenaStranica.style.display = 'block';
  }

  window.scrollTo(0, 0);
}

export function toggleMenu() {
  const sideDrawer = document.getElementById('side-drawer');
  const overlay = document.getElementById('overlay');
  
  if (sideDrawer && overlay) {
    sideDrawer.classList.toggle('open');
    overlay.classList.toggle('active');
  }
}