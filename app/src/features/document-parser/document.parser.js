const SUPPORTED_EXTENSIONS = ['docx', 'rtf', 'odt', 'txt'];

function extensionOf(file) {
  return file.name.split('.').pop()?.toLowerCase() || '';
}

function extractXmlText(xml, tagName) {
  const parser = new DOMParser();
  const document = parser.parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) {
    throw new Error('Dokument sadrži neispravan XML.');
  }

  return Array.from(document.getElementsByTagName(tagName))
    .map(node => node.textContent || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripRtf(rtf) {
  return rtf
    .replace(/\\'[0-9a-f]{2}/gi, match => String.fromCharCode(parseInt(match.slice(2), 16)))
    .replace(/\\u(-?\d+)\??/g, (_, code) => String.fromCharCode(Number(code) < 0 ? Number(code) + 65536 : Number(code)))
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\tab/g, '\t')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\\([{}\\])/g, '$1')
    .replace(/\r\n?|\n/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function assertSupported(file) {
  const extension = extensionOf(file);
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new Error('Podržani formati su DOCX, RTF, ODT i TXT.');
  }
  return extension;
}

export async function parseDocumentFile(file) {
  if (!file) throw new Error('Nije odabrana datoteka prijevoda.');

  const extension = assertSupported(file);
  if (extension === 'txt') return file.text();
  if (extension === 'rtf') return stripRtf(await file.text());

  if (typeof JSZip === 'undefined') {
    throw new Error('Parser dokumenata nije dostupan. Osvježite stranicu i pokušajte ponovno.');
  }

  const zip = await JSZip.loadAsync(file);
  const entryName = extension === 'docx' ? 'word/document.xml' : 'content.xml';
  const entry = zip.file(entryName);
  if (!entry) throw new Error(`Datoteka ${file.name} nema očekivani sadržaj.`);

  const xml = await entry.async('string');
  return extractXmlText(xml, extension === 'docx' ? 'w:t' : 'text:p');
}

export function jePodrzanaDokumentDatoteka(file) {
  return Boolean(file && SUPPORTED_EXTENSIONS.includes(extensionOf(file)));
}

export { SUPPORTED_EXTENSIONS };
