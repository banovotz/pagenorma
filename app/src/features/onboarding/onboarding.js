// ============================================================================
// ONBOARDING TOUR FOR DEMO PROJECT
// ============================================================================
// Guides the user step-by-step through key features when opening a demo project:
// 1. Dashboard / Edit button - Project parameters & source/translation documents
// 2. Translation Analytics - Opening analysis & side-by-side view with AI commentary
// 3. Project Glossary - "View Glossary" button and terminology consistency
// 4. Settings - Connecting Google account and entering Gemini API key
// ============================================================================

import { navigirajNa, zatvoriModalGlosar } from '../../core/router.js';

const STORAGE_TOUR_PENDING = 'pagenorma_start_demo_tour';
const STORAGE_TOUR_COMPLETED = 'pagenorma_demo_tour_completed';
const DEMO_PROJECT_ID = 'proj_1789242662713';

let currentStep = 0;
let isTourActive = false;
let resizeHandler = null;
let currentTargetEl = null;

const TOUR_STEPS = [
  {
    id: 'step-dashboard-edit',
    route: 'dashboard',
    badge: 'Step 1 of 4',
    title: '1. Project Parameters & Documents',
    description: `Here you can customize or update project parameters — such as <strong>deadline</strong>, <strong>daily page goal</strong>, and <strong>rate per standard page</strong>.<br><br>
      💡 <em>To manage your own project, upload your source ePub/PDF document here and connect your translation file or Google Docs link.</em>`,
    getTarget: () => {
      return document.getElementById(`btn-edit-${DEMO_PROJECT_ID}`) || 
             document.querySelector('#dashboard-page .card-projekt button[id^="btn-edit-"]') ||
             document.querySelector('#dashboard-page .card-projekt');
    },
    nextLabel: 'Next: Translation Analytics →',
    position: 'top'
  },
  {
    id: 'step-translation-analytics',
    route: 'translation-analytics',
    badge: 'Step 2 of 4',
    title: '2. Translation Analytics & Reviews',
    description: `On this screen you can view translation analyses. Click <strong>'Open Analysis'</strong> to view the detailed side-by-side alignment.<br><br>
      <em>Translation Analytics</em> is designed to <strong>compare source and translation</strong> paragraph-by-paragraph with <strong>automated AI commentary</strong> analyzing rhythm, tone, and translation nuances without modifying your text.`,
    getTarget: () => {
      return document.getElementById(`btn-otvori-analizu-${DEMO_PROJECT_ID}`) ||
             document.querySelector('#lista-analiza-container button[id^="btn-otvori-analizu-"]') ||
             document.getElementById('lista-analiza-container');
    },
    nextLabel: 'Open Analysis & Glossary →',
    position: 'top'
  },
  {
    id: 'step-glossary',
    route: 'translation-analytics/interlinear',
    routeParams: { projektId: DEMO_PROJECT_ID },
    badge: 'Step 3 of 4',
    title: '3. Project Glossary & Terminology',
    description: `Inside the AI comments column, you will find the <strong>'View Glossary'</strong> button.<br><br>
      The glossary serves as an <strong>automatic dictionary of key terms, character names, and recurring phrases</strong> extracted by AI. It helps maintain terminology consistency across your entire manuscript.`,
    getTarget: () => {
      return document.querySelector('#interlinear-page .btn-sync-small') ||
             document.querySelector('#col-komentari');
    },
    nextLabel: 'Next: Settings →',
    position: 'top'
  },
  {
    id: 'step-settings',
    route: 'settings',
    badge: 'Step 4 of 4',
    title: '4. Settings: Google Account & Gemini Key',
    description: `To work with your own translation projects, configure two essentials in <strong>Settings</strong>:<br><br>
      1. <strong>Connect your Google Account</strong> — to securely sync your private Google Docs translations.<br>
      2. <strong>Add your Gemini API Key</strong> — a free key from Google AI Studio that powers AI analyses, commentary, and glossary generation.`,
    getTarget: () => {
      return document.getElementById('gemini-api-key') ||
             document.getElementById('btn-google-authenticate') ||
             document.querySelector('.settings-card') ||
             document.getElementById('settings-page');
    },
    nextLabel: 'Finish Tour ✓',
    position: 'top'
  }
];

/**
 * Checks if the onboarding tour should automatically start
 */
export function provjeriIInicijalizirajOnboarding() {
  const pending = localStorage.getItem(STORAGE_TOUR_PENDING) || sessionStorage.getItem(STORAGE_TOUR_PENDING);
  if (pending === 'true') {
    localStorage.removeItem(STORAGE_TOUR_PENDING);
    sessionStorage.removeItem(STORAGE_TOUR_PENDING);
    setTimeout(() => {
      pokreniOnboardingVodic(0);
    }, 600);
  }
}

/**
 * Starts the onboarding tour from a specific step (defaults to 0)
 */
export function pokreniOnboardingVodic(startStep = 0) {
  currentStep = Math.max(0, Math.min(startStep, TOUR_STEPS.length - 1));
  isTourActive = true;
  prikaziKorak(currentStep);

  if (!resizeHandler) {
    resizeHandler = () => {
      if (isTourActive) pozicionirajModal();
    };
    window.addEventListener('resize', resizeHandler);
    window.addEventListener('scroll', resizeHandler, true);
  }
}

/**
 * Closes / skips the onboarding tour
 */
export function zatvoriOnboardingVodic(oznaciKaoZavrseno = true) {
  isTourActive = false;
  zatvoriModalGlosar();
  ukloniIsticanjeCilja();
  ukloniModalMarkup();

  if (oznaciKaoZavrseno) {
    localStorage.setItem(STORAGE_TOUR_COMPLETED, 'true');
  }

  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    window.removeEventListener('scroll', resizeHandler, true);
    resizeHandler = null;
  }
}

/**
 * Displays a specific tour step
 */
async function prikaziKorak(stepIndex) {
  if (!isTourActive) return;
  if (stepIndex !== 2) {
    zatvoriModalGlosar();
  }
  currentStep = stepIndex;
  const step = TOUR_STEPS[currentStep];
  if (!step) return;

  // 1. Navigate to route if needed
  if (step.route) {
    navigirajNa(step.route, step.routeParams || {});
    await new Promise(res => setTimeout(res, 280));
  }

  // 2. Find target element
  let target = step.getTarget();
  if (!target) {
    await new Promise(res => setTimeout(res, 350));
    target = step.getTarget();
  }

  ukloniIsticanjeCilja();
  currentTargetEl = target;

  if (target) {
    target.classList.add('onboarding-target-highlight');
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }

  // 3. Create or refresh modal
  osvjeziModalMarkup(step);

  // 4. Position modal near target
  setTimeout(() => {
    pozicionirajModal();
  }, 100);
}

/**
 * Removes highlight from target element
 */
function ukloniIsticanjeCilja() {
  if (currentTargetEl) {
    currentTargetEl.classList.remove('onboarding-target-highlight');
    currentTargetEl = null;
  }
  document.querySelectorAll('.onboarding-target-highlight').forEach(el => {
    el.classList.remove('onboarding-target-highlight');
  });
}

/**
 * Creates or refreshes the onboarding modal HTML
 */
function osvjeziModalMarkup(step) {
  let card = document.getElementById('onboarding-tour-card');
  if (!card) {
    card = document.createElement('div');
    card.id = 'onboarding-tour-card';
    card.className = 'onboarding-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    document.body.appendChild(card);
  }

  const isFirst = currentStep === 0;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  // Step indicator dots
  const dotsHtml = TOUR_STEPS.map((_, i) => `
    <span class="onboarding-dot ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'completed' : ''}"></span>
  `).join('');

  card.innerHTML = `
    <div class="onboarding-arrow" id="onboarding-arrow"></div>
    <div class="onboarding-header">
      <div class="onboarding-badge">
        <span class="onboarding-badge-dot"></span>
        ${step.badge}
      </div>
      <button type="button" class="onboarding-btn-close" id="onboarding-btn-close" aria-label="Close tour" title="Skip tour">×</button>
    </div>
    
    <h3 class="onboarding-title">${step.title}</h3>
    <div class="onboarding-body">${step.description}</div>
    
    <div class="onboarding-footer">
      <div class="onboarding-dots">
        ${dotsHtml}
      </div>
      <div class="onboarding-actions">
        ${!isFirst ? `<button type="button" class="btn-secondary onboarding-btn-prev" id="onboarding-btn-prev">← Back</button>` : `<button type="button" class="btn-text onboarding-btn-skip" id="onboarding-btn-skip">Skip</button>`}
        <button type="button" class="btn-primary onboarding-btn-next" id="onboarding-btn-next">${step.nextLabel}</button>
      </div>
    </div>
  `;

  // Attach button event listeners
  document.getElementById('onboarding-btn-close')?.addEventListener('click', () => zatvoriOnboardingVodic(true));
  document.getElementById('onboarding-btn-skip')?.addEventListener('click', () => zatvoriOnboardingVodic(true));
  document.getElementById('onboarding-btn-prev')?.addEventListener('click', () => {
    if (currentStep > 0) prikaziKorak(currentStep - 1);
  });
  document.getElementById('onboarding-btn-next')?.addEventListener('click', () => {
    if (isLast) {
      zatvoriOnboardingVodic(true);
    } else {
      prikaziKorak(currentStep + 1);
    }
  });

  // ESC shortcut
  const keyHandler = (e) => {
    if (e.key === 'Escape') {
      zatvoriOnboardingVodic(true);
      window.removeEventListener('keydown', keyHandler);
    }
  };
  window.addEventListener('keydown', keyHandler);
}

/**
 * Positions modal near target element
 */
function pozicionirajModal() {
  const card = document.getElementById('onboarding-tour-card');
  const arrow = document.getElementById('onboarding-arrow');
  if (!card) return;

  const target = currentTargetEl;
  if (!target) {
    card.style.position = 'fixed';
    card.style.top = '50%';
    card.style.left = '50%';
    card.style.transform = 'translate(-50%, -50%)';
    card.style.bottom = 'auto';
    card.style.right = 'auto';
    if (arrow) arrow.style.display = 'none';
    return;
  }

  const rect = target.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const margin = 14;
  const arrowHeight = 10;

  let top;
  let left = rect.left + (rect.width / 2) - (cardRect.width / 2);
  let placeAbove = true;

  const viewportWidth = window.innerWidth;
  if (left < 16) left = 16;
  if (left + cardRect.width > viewportWidth - 16) {
    left = viewportWidth - cardRect.width - 16;
  }

  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;

  if (spaceAbove >= cardRect.height + margin + arrowHeight + 10) {
    placeAbove = true;
    top = rect.top - cardRect.height - margin;
  } else if (spaceBelow >= cardRect.height + margin + arrowHeight + 10) {
    placeAbove = false;
    top = rect.bottom + margin;
  } else {
    if (spaceAbove >= spaceBelow) {
      placeAbove = true;
      top = Math.max(16, rect.top - cardRect.height - margin);
    } else {
      placeAbove = false;
      top = Math.min(window.innerHeight - cardRect.height - 16, rect.bottom + margin);
    }
  }

  card.style.position = 'fixed';
  card.style.top = `${Math.round(top)}px`;
  card.style.left = `${Math.round(left)}px`;
  card.style.transform = 'none';

  if (arrow) {
    arrow.style.display = 'block';
    const arrowX = rect.left + (rect.width / 2) - left;
    const clampedArrowX = Math.max(20, Math.min(cardRect.width - 20, arrowX));
    arrow.style.left = `${Math.round(clampedArrowX)}px`;

    if (placeAbove) {
      arrow.className = 'onboarding-arrow arrow-bottom';
    } else {
      arrow.className = 'onboarding-arrow arrow-top';
    }
  }
}

/**
 * Removes modal from DOM
 */
function ukloniModalMarkup() {
  document.getElementById('onboarding-tour-card')?.remove();
  document.getElementById('onboarding-tour-overlay')?.remove();
}

/**
 * Shows demo tour banner on dashboard
 */
export function prikaziDemoVodicBanner(container) {
  if (!container) return;
  
  document.getElementById('demo-tour-banner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'demo-tour-banner';
  banner.className = 'demo-tour-banner';
  banner.innerHTML = `
    <div class="demo-tour-banner-content">
      <span class="demo-tour-badge">🎓 Demo Project</span>
      <span class="demo-tour-banner-text">Exploring preloaded demo project <strong>"Ved Vejen"</strong>.</span>
    </div>
    <button type="button" id="btn-pokreni-demo-vodic" class="btn-secondary demo-tour-launch-btn">
      <svg class="btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polygon points="10 8 16 12 10 16 10 8"></polygon>
      </svg>
      Start Demo Tour
    </button>
  `;

  container.insertBefore(banner, container.firstChild);

  document.getElementById('btn-pokreni-demo-vodic')?.addEventListener('click', () => {
    pokreniOnboardingVodic(0);
  });
}
