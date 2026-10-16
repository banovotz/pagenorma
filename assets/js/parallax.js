// ============================================================================
// PARALLAX & SCROLL REVEAL (landing page)
// ============================================================================
// Elements marked with `data-parallax="speed"` translate vertically relative to
// their own section (negative speed = moves up as you scroll down). Elements
// marked with `data-reveal"` fade/slide in once they enter the viewport, with
// an optional stagger via the --reveal-delay custom property.
//
// The whole file bails out when the `js-effects` class is missing (JS disabled
// or prefers-reduced-motion: reduce) — in that case every element stays fully
// visible in its static position.
// ============================================================================

(function () {
  'use strict';

  if (!document.documentElement.classList.contains('js-effects')) return;

  const PARALLAX_SELECTOR = '[data-parallax]';
  const REVEAL_SELECTOR = '[data-reveal]';
  const MOBILE_BREAKPOINT = 768;

  // --------------------------------------------------------------------------
  // Parallax — rAF-throttled scroll, transform only (no layout thrash)
  // --------------------------------------------------------------------------

  let layers = [];
  let sectionTops = new Map();
  let frameRequested = false;
  let parallaxEnabled = window.innerWidth > MOBILE_BREAKPOINT;

  // Measure each layer's position inside its section once (and on resize),
  // so the scroll handler only reads cached numbers.
  function measureLayers() {
    parallaxEnabled = window.innerWidth > MOBILE_BREAKPOINT;
    layers = Array.from(document.querySelectorAll(PARALLAX_SELECTOR)).map((el) => {
      const section = el.closest('section') || el.parentElement;
      return {
        el: el,
        speed: parseFloat(el.dataset.parallax) || 0,
        section: section
      };
    });

    sectionTops = new Map();
    layers.forEach(({ section }) => {
      if (section && !sectionTops.has(section)) {
        sectionTops.set(section, section.getBoundingClientRect().top + window.scrollY);
      }
    });

    if (!parallaxEnabled) {
      // Mobile: drop all transforms, keep the static design.
      layers.forEach(({ el }) => { el.style.transform = ''; });
    }
  }

  function applyParallax() {
    frameRequested = false;
    if (!parallaxEnabled) return;

    const viewportMiddle = window.scrollY + window.innerHeight / 2;

    layers.forEach(({ el, speed, section }) => {
      const sectionTop = sectionTops.get(section);
      if (sectionTop === undefined) return;
      // Distance of the section's middle from the viewport middle, normalised.
      const sectionHeight = section.offsetHeight || 1;
      const sectionMiddle = sectionTop + sectionHeight / 2;
      const offset = (viewportMiddle - sectionMiddle) / (window.innerHeight + sectionHeight);
      // Clamp so layers don't fly off-screen.
      const translate = Math.max(-1, Math.min(1, offset)) * speed * window.innerHeight;
      el.style.transform = 'translate3d(0,' + translate.toFixed(1) + 'px,0)';
    });
  }

  function requestParallaxFrame() {
    if (!frameRequested) {
      frameRequested = true;
      requestAnimationFrame(applyParallax);
    }
  }

  // --------------------------------------------------------------------------
  // Scroll reveal — IntersectionObserver, unobserve after first reveal
  // --------------------------------------------------------------------------

  function initReveal() {
    const targets = document.querySelectorAll(REVEAL_SELECTOR);
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });

    targets.forEach((el) => observer.observe(el));
  }

  // --------------------------------------------------------------------------
  // Init
  // --------------------------------------------------------------------------

  function init() {
    measureLayers();
    applyParallax();
    initReveal();

    window.addEventListener('scroll', requestParallaxFrame, { passive: true });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        measureLayers();
        requestParallaxFrame();
      }, 150);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
