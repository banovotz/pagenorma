// projectParser.js

/**
 * Parsira ePub datoteku: izvlači naslov, sliku naslovnice i broji znakove s razmacima.
 */
async function parseEpubFile(file) {
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

  // 3. Prolazak kroz sva HTML/XHTML poglavlja i brojanje znakova
  for (const filename of Object.keys(zip.files)) {
    if (/\.(xhtml|html|htm)$/i.test(filename)) {
      const htmlText = await zip.files[filename].async("string");
      const doc = parser.parseFromString(htmlText, "text/html");
      const cleanText = doc.body ? doc.body.textContent : "";
      totalCharsWithSpaces += cleanText.length;
    }
  }

  return {
    title,
    coverDataUrl,
    origCharCount: totalCharsWithSpaces,
    origPages: (totalCharsWithSpaces / 1800).toFixed(2)
  };
}

/**
 * Dohvaća broj znakova s razmacima iz javnog Google Doc-a.
 */
async function fetchGoogleDocCharCount(docUrl) {
  const match = docUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error("Neispravan Google Docs URL.");
  }

  const docId = match[1];
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;

  const response = await fetch(exportUrl);
  if (!response.ok) {
    throw new Error("Dokument nije dostupan. Provjerite je li podijeljen kao 'Svatko s poveznicom' (Anyone with the link).");
  }

  const text = await response.text();
  const charCount = text.length;

  return {
    docCharCount: charCount,
    docPages: (charCount / 1800).toFixed(2)
  };
}