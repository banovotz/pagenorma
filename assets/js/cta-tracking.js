// GA4 tracking for CTA clicks. Loaded on every page from the default layout;
// links opt in with data-cta="location" (hero, nav, mid-page, final, ...).
(function () {
  document.addEventListener('click', function (event) {
    if (typeof window.gtag !== 'function') return;

    var target = event.target instanceof Element ? event.target.closest('[data-cta]') : null;
    if (!target) return;

    window.gtag('event', 'cta_click', {
      cta_location: target.getAttribute('data-cta') || 'unknown',
      cta_label: (target.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      cta_destination: target.getAttribute('href') || ''
    });
  }, true);
})();
