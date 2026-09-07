// Upravljanje navigacijom, prikazom stranica i poviješću (History API)

// Privatna pomoćna funkcija koja samo mijenja DOM bez doticaja s history i pustanjem novih unosa
function primijeniPrikazStranice(pageId) {
  const sveStranice = document.querySelectorAll('.page-content');
  
  sveStranice.forEach(page => {
    page.style.display = 'none';
  });

  const trazenaStranica = document.getElementById(pageId);
  if (trazenaStranica) {
    trazenaStranica.style.display = 'block';
  } else {
    // Fallback ako tražena stranica ne postoji (npr. otvori dashboard)
    const fallback = document.getElementById('dashboard-page');
    if (fallback) fallback.style.display = 'block';
  }

  window.scrollTo(0, 0);
}

/**
 * Glavna funkcija za navigaciju na određenu stranicu.
 * @param {string} pageId - ID HTML elementa stranice (npr. 'dashboard-page')
 * @param {boolean} [pushState=true] - Određuje dodaje li se korak u povijest preglednika
 */
export function prikaziStranicu(pageId, pushState = true) {
  if (!pageId) return;

  primijeniPrikazStranice(pageId);

  if (pushState) {
    // Stvaramo čisti hash za URL (npr. 'dashboard-page' -> '#dashboard')
    const routeHash = '#' + pageId.replace('-page', '');
    
    // Dodajemo novi zapis u povijest preglednika samo ako se hash razlikuje od trenutnog
    if (window.location.hash !== routeHash) {
      history.pushState({ pageId: pageId }, '', routeHash);
    }
  }
}

/**
 * Inicijalizacija routera – sluša nativni događaj preglednika za povratak (popstate)
 * i postavlja početno stanje.
 */
export function inicijalizirajRouter(defaultPageId = 'dashboard-page') {
  // 1. Slušatelj za Back / Forward gumbe preglednika ili mobilne geste
  window.addEventListener('popstate', (event) => {
    if (event.state && event.state.pageId) {
      // Vraćamo prikaz bez ponovnog dodavanja u history (pushState = false)
      prikaziStranicu(event.state.pageId, false);
    } else {
      // Ako nema stanja u eventu, pokušaj pročitati iz URL Hasha
      const currentHash = window.location.hash.replace('#', '');
      const pageIdFromHash = currentHash ? `${currentHash}-page` : defaultPageId;
      prikaziStranicu(pageIdFromHash, false);
    }
  });

  // 2. Rukovanje početnim učitavanjem aplikacije (npr. izravni ulaz preko #statisitka)
  const initialHash = window.location.hash.replace('#', '');
  const initialPageId = initialHash ? `${initialHash}-page` : defaultPageId;

  // Postavljamo početno stanje povijesti bez stvaranja novog zapisa
  history.replaceState({ pageId: initialPageId }, '', `#${initialPageId.replace('-page', '')}`);
  primijeniPrikazStranice(initialPageId);
}

