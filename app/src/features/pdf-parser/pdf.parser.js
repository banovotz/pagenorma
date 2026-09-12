const OCR_LANGUAGES = [
  'eng', 'hrv', 'srp', 'slv', 'bos', 'deu', 'fra', 'spa', 'ita', 'por',
  'nld', 'dan', 'swe', 'nor', 'fin', 'isl', 'pol', 'ces', 'slk', 'hun',
  'ron', 'cat', 'eus', 'glg', 'tur'
].join('+');

function getPdfJs() {
  if (!window.pdfjsLib) {
    throw new Error('PDF biblioteka nije učitana. Osvježite aplikaciju i pokušajte ponovno.');
  }
  return window.pdfjsLib;
}

async function renderPage(page, scale = 1.5) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas;
}

async function createOcrWorker(onProgress) {
  if (!window.Tesseract?.createWorker) {
    throw new Error('OCR biblioteka nije učitana. Osvježite aplikaciju i pokušajte ponovno.');
  }

  return window.Tesseract.createWorker(OCR_LANGUAGES, 1, {
    logger: message => {
      if (typeof onProgress === 'function' && message.status === 'recognizing text') {
        onProgress(message.progress);
      }
    }
  });
}

function titleFromText(text, fileName) {
  const firstLine = text.split(/\r?\n/).map(line => line.trim()).find(Boolean);
  return firstLine || fileName.replace(/\.pdf$/i, '');
}

function normalizePageText(text) {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function parsePdfFile(file, onProgress) {
  if (!file) return { title: '', coverDataUrl: null, origCharCount: 0, text: '' };

  const pdfjs = getPdfJs();
  const documentData = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  let firstPageCover = null;
  let worker = null;

  try {
    for (let pageNumber = 1; pageNumber <= documentData.numPages; pageNumber += 1) {
      const page = await documentData.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const embeddedText = normalizePageText(textContent.items
        .map(item => `${item.str || ''}${item.hasEOL ? '\n' : ' '}`)
        .join(''));

      const canvas = await renderPage(page);
      if (pageNumber === 1) {
        firstPageCover = canvas.toDataURL('image/jpeg', 0.85);
      }

      let pageText = embeddedText;
      if (pageText.length < 20) {
        if (!worker) worker = await createOcrWorker(progress => {
          if (typeof onProgress === 'function') {
            onProgress({ page: pageNumber, pages: documentData.numPages, progress });
          }
        });
        const result = await worker.recognize(canvas);
        pageText = normalizePageText(result.data.text);
      }

      if (pageText) pages.push(pageText);
      if (typeof onProgress === 'function') {
        onProgress({ page: pageNumber, pages: documentData.numPages, progress: 1 });
      }
    }
  } finally {
    if (worker) await worker.terminate();
    await documentData.destroy();
  }

  const text = pages.join('\n\n');
  return {
    title: titleFromText(text, file.name),
    coverDataUrl: firstPageCover,
    origCharCount: text.length,
    origPages: (text.length / 1800).toFixed(2),
    text
  };
}

export async function dohvatiCijeliTekstIzPdfa(file, onProgress) {
  const result = await parsePdfFile(file, onProgress);
  return result.text;
}

export function jePdfDatoteka(file) {
  return Boolean(file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)));
}
