const FIREBASE_VERSION = '10.12.2';
const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: 'pagenorma-7d199.firebaseapp.com',
  projectId: 'pagenorma-7d199',
  appId: ''
};

let firebaseServices;
let unsubscribeAuth;
let unsubscribeProfile;
let currentUser = null;
let currentProfile = null;
let authMode = 'signin';
let eventsBound = false;

function firebaseConfig() {
  return { ...FIREBASE_CONFIG, ...window.PAGENORMA_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCfSWaXm5Fnl3iUqRl4CJvBQb142BW1RBc',
  appId: 'pagenorma-7d199'
        } 
    }
}

async function loadFirebase() {
  if (!firebaseServices) {
    const [app, auth, firestore] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`)
    ]);
    const firebaseApp = app.initializeApp(firebaseConfig());
    const firebaseAuth = auth.getAuth(firebaseApp);
    firebaseServices = {
      ...auth,
      ...firestore,
      auth: firebaseAuth
    };
  }
  return firebaseServices;
}

function hasFirebaseConfig() {
  const config = firebaseConfig();
  return Boolean(config.apiKey && config.appId);
}

function profilePath(user) {
  return firebaseServices.doc(firebaseServices.getFirestore(), 'users', user.uid);
}

function isQuietStudio() {
  return Boolean(currentProfile?.isQuietStudio);
}

function updateBrand() {
  const logo = document.getElementById('pagenorma-logo');
  if (!logo) return;
  logo.src = isQuietStudio()
    ? './public/icons/pagenorma-qs.svg'
    : './public/icons/pagenorma-s.svg';
  logo.alt = isQuietStudio() ? 'pagenorma QS' : 'pagenorma S';
}

function setStatus(message, isError = false) {
  const status = document.getElementById('subscription-status');
  if (status) {
    status.textContent = message;
    status.classList.toggle('subscription-error', isError);
  }
}

function renderSubscription() {
  const root = document.getElementById('subscription-page');
  if (!root) return;
  const signedOut = !currentUser;
  const subscribed = isQuietStudio();
  root.querySelector('[data-subscription-auth]')?.classList.toggle('sakriveno', !signedOut);
  root.querySelector('[data-subscription-account]')?.classList.toggle('sakriveno', signedOut);
  root.querySelector('[data-subscription-offer]')?.classList.toggle('sakriveno', signedOut || subscribed);
  root.querySelector('[data-subscription-active]')?.classList.toggle('sakriveno', signedOut || !subscribed);

  const email = root.querySelector('[data-subscription-email]');
  if (email) email.textContent = currentUser?.email || '';
  const plan = root.querySelector('[data-subscription-plan]');
  if (plan) plan.textContent = subscribed ? 'pagenorma QS' : 'pagenorma S';
  updateBrand();
}

function showCheckout() {
  const checkout = document.getElementById('mock-checkout');
  const promo = document.getElementById('subscription-promo');
  const applied = document.getElementById('checkout-promo');
  if (applied) applied.textContent = promo?.value.trim() || 'Nema promo koda';
  checkout?.classList.remove('sakriveno');
}

function closeCheckout() {
  document.getElementById('mock-checkout')?.classList.add('sakriveno');
}

async function simulatePayment() {
  if (!currentUser) {
    setStatus('Za simulaciju plaćanja prvo se prijavite.', true);
    closeCheckout();
    return;
  }
  const type = document.querySelector('input[name="subscriptionType"]:checked')?.value || 'annual';
  try {
    // U produkciji ovaj poziv zamjenjuje callable Cloud Function iz Lemon Squeezy webhooka.
    await firebaseServices.setDoc(profilePath(currentUser), {
      isQuietStudio: true,
      subscriptionStatus: 'active',
      subscriptionType: type,
      subscriptionValidUntil: firebaseServices.serverTimestamp()
    }, { merge: true });
    closeCheckout();
    setStatus('Pretplata je aktivirana. Status se sinkronizira iz Firestorea.');
  } catch (error) {
    console.error('Mock checkout nije uspio:', error);
    setStatus('Pretplatu nije moguće aktivirati. Provjerite Firestore pravila.', true);
  }
}

async function signInWithGoogle() {
  try {
    const provider = new firebaseServices.GoogleAuthProvider();
    await firebaseServices.signInWithPopup(firebaseServices.auth, provider);
  } catch (error) {
    console.error('Google prijava nije uspjela:', error);
    setStatus(`Google prijava nije uspjela: ${error.message}`, true);
  }
}

async function submitEmailAuth(event) {
  event.preventDefault();
  const email = document.getElementById('subscription-email-input')?.value.trim();
  const password = document.getElementById('subscription-password-input')?.value;
  if (!email || !password) {
    setStatus('Unesite e-mail i lozinku.', true);
    return;
  }
  try {
    if (authMode === 'signup') {
      await firebaseServices.createUserWithEmailAndPassword(firebaseServices.auth, email, password);
    } else {
      await firebaseServices.signInWithEmailAndPassword(firebaseServices.auth, email, password);
    }
  } catch (error) {
    console.error('Email autentifikacija nije uspjela:', error);
    setStatus(`Autentifikacija nije uspjela: ${error.message}`, true);
  }
}

function bindSubscriptionEvents() {
  if (eventsBound) return;
  eventsBound = true;
  document.getElementById('subscription-google')?.addEventListener('click', signInWithGoogle);
  document.getElementById('subscription-email-form')?.addEventListener('submit', submitEmailAuth);
  document.getElementById('subscription-signup-toggle')?.addEventListener('click', () => {
    authMode = authMode === 'signup' ? 'signin' : 'signup';
    const button = document.getElementById('subscription-email-submit');
    const toggle = document.getElementById('subscription-signup-toggle');
    if (button) button.textContent = authMode === 'signup' ? 'Registriraj račun' : 'Prijavi se';
    if (toggle) toggle.textContent = authMode === 'signup' ? 'Već imate račun? Prijava' : 'Novi račun';
  });
  document.getElementById('subscription-signout')?.addEventListener('click', () => firebaseServices.signOut(firebaseServices.auth));
  document.getElementById('subscription-checkout')?.addEventListener('click', showCheckout);
  document.getElementById('mock-checkout-close')?.addEventListener('click', closeCheckout);
  document.getElementById('mock-payment')?.addEventListener('click', simulatePayment);
}

export async function initSubscriptionModule() {
  bindSubscriptionEvents();
  renderSubscription();
  if (!hasFirebaseConfig()) {
    setStatus('Firebase konfiguracija nije postavljena. Postavite window.PAGENORMA_FIREBASE_CONFIG (apiKey i appId).', true);
    return;
  }
  try {
    const services = await loadFirebase();
    unsubscribeAuth?.();
    unsubscribeAuth = services.onAuthStateChanged(services.auth, (user) => {
      unsubscribeProfile?.();
      currentUser = user;
      currentProfile = null;
      renderSubscription();
      if (!user) return;
      unsubscribeProfile = services.onSnapshot(profilePath(user), (snapshot) => {
        currentProfile = snapshot.exists() ? snapshot.data() : { isQuietStudio: false, subscriptionStatus: 'no' };
        renderSubscription();
        if (!snapshot.exists()) {
          services.setDoc(profilePath(user), {
            email: user.email || '',
            createdAt: services.serverTimestamp()
          }, { merge: true }).catch((error) => {
            console.error('Početni korisnički profil nije moguće stvoriti:', error);
            setStatus('Korisnički profil nije moguće inicijalizirati.', true);
          });
        }
      }, (error) => {
        console.error('Firestore profil nije moguće pratiti:', error);
        setStatus('Profil pretplate nije dostupan.', true);
      });
    });
  } catch (error) {
    console.error('Firebase inicijalizacija nije uspjela:', error);
    setStatus('Firebase trenutno nije dostupan.', true);
  }
}
