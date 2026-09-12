// Upravljanje statusnim modalom za Gemini analizu i generičke dijaloge

export function prikaziStatusModal(statusPoruka = 'Učitavanje...') {
  const modal = document.getElementById('llm-status-modal');
  const infoBox = document.getElementById('llm-info-box');
  const progressContainer = document.getElementById('llm-progress-container');
  const progressBar = document.getElementById('llm-progress-bar');
  const statusText = document.getElementById('llm-status-text');
  const btnDownload = document.getElementById('btn-zapocni-download');

  if (modal) modal.style.display = 'flex';
  if (infoBox) infoBox.style.display = 'none';
  if (btnDownload) btnDownload.style.display = 'none';
  if (progressContainer) progressContainer.style.display = 'block';

  azurirajStatusModala(statusPoruka, 0);
}

export function sakrijStatusModal() {
  const modal = document.getElementById('llm-status-modal');
  if (modal) modal.style.display = 'none';
}

export function azurirajStatusModala(poruka, postotak = null) {
  const statusText = document.getElementById('llm-status-text');
  const progressBar = document.getElementById('llm-progress-bar');

  if (statusText && poruka) statusText.innerText = poruka;
  if (progressBar && postotak !== null) progressBar.style.width = `${postotak}%`;
}