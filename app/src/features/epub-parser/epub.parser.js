/**
 * Parsira ePub datoteku: izvlači naslov, sliku naslovnice i broji znakove s razmacima.
 */
function normalizirajPutanju(path) {
  const dijelovi = [];

  for (const dio of path.split('/')) {
    if (!dio || dio === '.') continue;
    if (dio === '..') {
      dijelovi.pop();
    } else {
      dijelovi.push(dio);
    }
  }

  return dijelovi.join('/');
}

function razrijesiRelativnuPutanju(basePath, href) {
  const baseDir = basePath.includes('/')
    ? basePath.slice(0, basePath.lastIndexOf('/') + 1)
    : '';
  return normalizirajPutanju(`${baseDir}${href.split('#')[0]}`);
}

/**
 * Vraća dokumente u čitalačkom redoslijedu koji definira OPF-ov spine.
 * Redoslijed zapisa u ZIP arhivi nije dio ePub formata i ne smije se koristiti.
 */
export async function dohvatiDokumenteSpinea(zip, parser) {
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('ePub nema META-INF/container.xml.');

  const containerXml = await containerFile.async('string');
  const containerDoc = parser.parseFromString(containerXml, 'text/xml');
  const rootfile = containerDoc.querySelector('rootfile');
  const opfPath = rootfile?.getAttribute('full-path');
  if (!opfPath) throw new Error('ePub nema putanju do OPF datoteke.');

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`ePub nema OPF datoteku: ${opfPath}`);

  const opfXml = await opfFile.async('string');
  const opfDoc = parser.parseFromString(opfXml, 'text/xml');
  const manifest = new Map(
    Array.from(opfDoc.querySelectorAll('manifest > item'))
      .map(item => [item.getAttribute('id'), item.getAttribute('href')])
      .filter(([, href]) => href)
  );

  const spine = Array.from(opfDoc.querySelectorAll('spine > itemref'))
    .filter(itemref => itemref.getAttribute('linear') !== 'no')
    .map(itemref => manifest.get(itemref.getAttribute('idref')))
    .filter(Boolean)
    .map(href => razrijesiRelativnuPutanju(opfPath, href))
    .filter(path => /\.(xhtml|html|htm)$/i.test(path));

  if (spine.length > 0) {
    return spine.filter(path => zip.file(path));
  }

  // Neispravan/neuobičajen ePub bez spine-a: barem čitaj deterministički.
  return Object.keys(zip.files)
    .filter(path => /\.(xhtml|html|htm)$/i.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function parseEpubFile(file) {
  const zip = await JSZip.loadAsync(file);
  const parser = new DOMParser();

  let title = file.name.replace(/\.epub$/i, '');
  let coverDataUrl = null;
  let totalCharsWithSpaces = 0;

  // 1. Pronalaženje .opf datoteke radi metapodataka i naslovnice
  let opfPath = '';
  const containerFile = zip.file("META-INF/container.xml");
  if (containerFile) {
    const containerXml = await containerFile.async("string");
    const containerDoc = parser.parseFromString(containerXml, "text/xml");
    const rootfile = containerDoc.querySelector("rootfile");
    if (rootfile) opfPath = rootfile.getAttribute("full-path");
  }

  // 2. Izvlačenje naslova i putanje naslovnice iz OPF-a
  let coverHref = null;
  if (opfPath && zip.file(opfPath)) {
    const opfXml = await zip.file(opfPath).async("string");
    const opfDoc = parser.parseFromString(opfXml, "text/xml");

    // Naslov
    const titleEl = opfDoc.querySelector("title") || opfDoc.querySelector("dc\\:title");
    if (titleEl && titleEl.textContent) {
      title = titleEl.textContent.trim();
    }

    // Traženje naslovnice (Cover Meta ili Item)
    const coverMeta = opfDoc.querySelector('meta[name="cover"]');
    if (coverMeta) {
      const coverId = coverMeta.getAttribute("content");
      const coverItem = opfDoc.querySelector(`item[id="${coverId}"]`);
      if (coverItem) coverHref = coverItem.getAttribute("href");
    }
    
    // Fallback za naslovnicu ako nema meta taga
    if (!coverHref) {
      const possibleCover = opfDoc.querySelector('item[properties*="cover-image"]') || 
                            opfDoc.querySelector('item[href*="cover"]');
      if (possibleCover) coverHref = possibleCover.getAttribute("href");
    }

    // Rješavanje relativne putanje naslovnice u odnosu na OPF
    if (coverHref) {
      const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
      const fullCoverPath = opfDir + coverHref;
      
      const coverFile = zip.file(fullCoverPath) || zip.file(coverHref);
      if (coverFile) {
        const base64 = await coverFile.async("base64");
        const ext = coverHref.split('.').pop().toLowerCase();
        const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
        coverDataUrl = `data:${mimeType};base64,${base64}`;
      }
    }
  }

  // 3. Prolazak kroz HTML/XHTML dokumente redoslijedom iz OPF spine-a
  const spineDocuments = await dohvatiDokumenteSpinea(zip, parser);
  for (const filename of spineDocuments) {
    const htmlText = await zip.file(filename).async("string");
    const doc = parser.parseFromString(htmlText, "text/html");
    const cleanText = doc.body ? doc.body.textContent : "";
    totalCharsWithSpaces += cleanText.length;
  }

  return {
    title,
    coverDataUrl,
    origCharCount: totalCharsWithSpaces,
    origPages: (totalCharsWithSpaces / 1800).toFixed(2)
  };
}

export function azurirajePrikazImenaEpuba(input) {
  const epubNameLabel = document.getElementById('p-epub-file-name');
  if (!epubNameLabel) return;

  if (input.files && input.files[0]) {
    const file = input.files[0];
    epubNameLabel.innerHTML = `📄 Odabrana nova datoteka: <strong>${file.name}</strong>`;
    epubNameLabel.style.color = '#1976d2'; // Plava boja za novi odabir
  }
}
