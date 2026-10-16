// ============================================================================
// PROMO BANNER (landing page)
// ============================================================================
// Kontrolira promo traku na vrhu početne stranice: zatvaranje (dismissing se
// pamti u localStorage ključu koji uključuje voucher kod, tako da nova kampanja
// s drugačijim kodom automatski ponovno prikazuje traku) i kopiranje voucher
// koda u međuspremnik.
// ============================================================================

(function () {
  const DISMISS_PREFIX = 'pagenorma_promo_dismissed_';
  const COPY_FEEDBACK_MS = 2000;

  function dismissKey(banner) {
    return DISMISS_PREFIX + (banner.dataset.voucher || 'default');
  }

  function sakrijBanner(banner) {
    banner.classList.add('promo-banner-hidden');
    // Nakon završetka prijelaza makni element iz toka dokumenta.
    banner.addEventListener('transitionend', () => {
      banner.hidden = true;
    }, { once: true });
    // Fallback ako prijelod ne okine (npr. element već skriven).
    setTimeout(() => { banner.hidden = true; }, 400);
  }

  function kopirajTekst(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback za starije preglednike / ne-sigurne kontekste.
    return new Promise((resolve, reject) => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('Copy failed'));
      } catch (err) {
        reject(err);
      } finally {
        textarea.remove();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const banner = document.getElementById('promo-banner');
    if (!banner) return;

    // Već zatvorena kampanja? Ne prikazuj banner (bez prijelaza).
    const key = dismissKey(banner);
    if (localStorage.getItem(key) === '1') {
      banner.hidden = true;
      return;
    }

    const dismissBtn = document.getElementById('promo-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        try {
          localStorage.setItem(key, '1');
        } catch (err) {
          // privatni način rada itd. – banner se svejedno zatvara
        }
        sakrijBanner(banner);
      });
    }

    const copyBtn = document.getElementById('promo-copy-btn');
    const codeEl = document.getElementById('promo-voucher-code');
    const labelEl = copyBtn ? copyBtn.querySelector('.promo-copy-label') : null;
    if (copyBtn && codeEl) {
      copyBtn.addEventListener('click', async () => {
        const code = codeEl.textContent.trim();
        try {
          await kopirajTekst(code);
          copyBtn.classList.add('promo-copy-btn-copied');
          copyBtn.setAttribute('aria-label', 'Voucher code copied');
          if (labelEl) labelEl.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.classList.remove('promo-copy-btn-copied');
            copyBtn.setAttribute('aria-label', 'Copy voucher code');
            if (labelEl) labelEl.textContent = 'Copy';
          }, COPY_FEEDBACK_MS);
        } catch (err) {
          console.error('Could not copy voucher code:', err);
          if (labelEl) labelEl.textContent = 'Press Ctrl+C';
        }
      });
    }
  });
})();
