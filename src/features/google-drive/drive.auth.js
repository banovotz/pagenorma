// Autentifikacija i upravljanje pristupnim tokenima za Google Drive API

export function dohvatiDriveAuthToken() {
  return localStorage.getItem('gdrive_access_token') || null;
}

export function spremiDriveAuthToken(token) {
  localStorage.setItem('gdrive_access_token', token);
}

export function odjaviGDrive() {
  localStorage.removeItem('gdrive_access_token');
}