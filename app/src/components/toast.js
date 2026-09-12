// Jednostavan sustav obavijesti (toast notificiranje)

export function prikaziToast(poruka, tip = 'info', trajanje = 3000) {
  let toastContainer = document.getElementById('toast-container');
  
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const bojaPozadine = tip === 'error' ? '#c62828' : tip === 'success' ? '#2e7d32' : '#008080';
  
  toast.style.cssText = `
    background: ${bojaPozadine};
    color: #fff;
    padding: 12px 20px;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-size: 0.9em;
    transition: opacity 0.3s ease;
  `;
  toast.innerText = poruka;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, trajanje);
}