const TOKEN_STORAGE_KEY = 'gdrive_auth';
const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/documents.readonly';
const GOOGLE_OAUTH_CLIENT_ID = '945891401889-fqhcu0inj6im0s1h682pd9r3b85kfa4p.apps.googleusercontent.com';

let tokenClient = null;
let scriptPromise = null;
let pendingTokenRequest = null;

function loadIdentityServices() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`)
      || document.createElement('script');
    if (!script.src) {
      script.src = GOOGLE_IDENTITY_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.onload = resolve;
    script.onerror = () => reject(new Error('Google prijava nije dostupna. Provjerite internetsku vezu.'));
  });

  return scriptPromise;
}

function loadStoredToken() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(TOKEN_STORAGE_KEY) || 'null');
    return stored && typeof stored.accessToken === 'string' ? stored : null;
  } catch {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    return null;
  }
}

function storeToken(response) {
  const token = {
    accessToken: response.access_token,
    expiresAt: Date.now() + ((Number(response.expires_in) || 3600) - 60) * 1000
  };
  sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
  return token.accessToken;
}

function requestToken(prompt) {
  if (pendingTokenRequest) return pendingTokenRequest;

  pendingTokenRequest = loadIdentityServices()
    .then(() => {
      return new Promise((resolve, reject) => {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_OAUTH_CLIENT_ID,
          scope: GOOGLE_SCOPE,
          callback: (response) => {
            if (response.error) {
              reject(new Error(`Google prijava nije uspjela: ${response.error}`));
              return;
            }
            resolve(storeToken(response));
          },
          error_callback: (error) => reject(new Error(`Google prijava nije uspjela: ${error.type || 'nepoznata greška'}`))
        });
        tokenClient.requestAccessToken({ prompt });
      });
    })
    .finally(() => {
      pendingTokenRequest = null;
    });

  return pendingTokenRequest;
}

export function dohvatiDriveAuthToken() {
  const stored = loadStoredToken();
  return stored && stored.expiresAt > Date.now() ? stored.accessToken : null;
}

export async function authenticateGoogleDrive() {
  const existingToken = dohvatiDriveAuthToken();
  if (existingToken) return existingToken;

  const stored = loadStoredToken();
  return requestToken(stored ? '' : 'consent');
}

export async function forceGoogleDriveAuthentication() {
  return requestToken('consent');
}

export async function refreshGoogleDriveToken() {
  return requestToken('');
}

export async function googleAuthenticatedFetch(url, options = {}) {
  let token = await authenticateGoogleDrive();
  let response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
  });

  if (response.status === 401) {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    token = await refreshGoogleDriveToken();
    response = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
    });
  }

  return response;
}

export function odjaviGDrive() {
  const token = loadStoredToken();
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  if (window.google?.accounts?.oauth2 && tokenClient) {
    if (token) window.google.accounts.oauth2.revoke(token.accessToken);
  }
  tokenClient = null;
}
