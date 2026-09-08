import { googleAuthenticatedFetch } from './drive.auth.js';

function extractDocumentId(gdocUrl) {
  let url;
  try {
    url = new URL(gdocUrl);
  } catch {
    throw new Error('Neispravan Google Docs URL.');
  }

  if (url.protocol !== 'https:' || !['docs.google.com', 'drive.google.com'].includes(url.hostname)) {
    throw new Error('URL mora voditi na Google Docs dokument.');
  }

  const match = url.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error('Neispravan Google Docs URL.');
  return match[1];
}

function extractText(content = []) {
  return content.map(element => {
    if (element.paragraph) {
      return element.paragraph.elements
        .map(item => item.textRun?.content || '')
        .join('');
    }
    if (element.table) {
      return element.table.tableRows
        .flatMap(row => row.tableCells.flatMap(cell => extractText(cell.content)))
        .join('');
    }
    if (element.tableOfContents) return extractText(element.tableOfContents.content);
    return '';
  }).join('');
}

export async function dohvatiCijeliTekstIzGDoca(gdocUrl) {
  if (!gdocUrl || typeof gdocUrl !== 'string') return '';

  const docId = extractDocumentId(gdocUrl);
  const response = await googleAuthenticatedFetch(`https://docs.googleapis.com/v1/documents/${docId}`);
  if (!response.ok) {
    let errorDetails = null;
    try {
      errorDetails = await response.json();
    } catch {
      errorDetails = null;
    }

    if (response.status === 403) {
      const reason = errorDetails?.error?.details?.find(detail => detail.reason)?.reason
        || errorDetails?.error?.status;
      if (reason === 'SERVICE_DISABLED' || reason === 'accessNotConfigured') {
        throw new Error('Google Docs API nije omogućen za ovu aplikaciju. Omogućite Google Docs API u Google Cloud projektu koji koristi OAuth klijent.');
      }
      if (reason === 'PERMISSION_DENIED' || reason === 'insufficientPermissions') {
        throw new Error('Prijavljeni Google račun nema pristup ovom dokumentu ili OAuth dozvola nije dovoljna. Odjavite se, prijavite račun koji vidi dokument i pokušajte ponovno.');
      }
      throw new Error('Google je odbio pristup dokumentu. Provjerite da je prijavljeni račun vlasnik dokumenta ili da mu je dokument podijeljen.');
    }
    throw new Error(`Nije moguće dohvatiti Google Doc (status: ${response.status}).`);
  }

  const document = await response.json();
  return extractText(document.body?.content);
}

export { extractDocumentId };
