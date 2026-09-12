export function normalizeInterlinearSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('hr-HR');
}

export function findMatchingParagraphIndices(sourceParagraphs = [], targetParagraphs = [], query) {
  const normalizedQuery = normalizeInterlinearSearchText(query).trim();
  const paragraphCount = Math.max(sourceParagraphs.length, targetParagraphs.length);

  if (!normalizedQuery) {
    return Array.from({ length: paragraphCount }, (_, index) => index);
  }

  return Array.from({ length: paragraphCount }, (_, index) => index)
    .filter(index => (
      normalizeInterlinearSearchText(sourceParagraphs[index]).includes(normalizedQuery) ||
      normalizeInterlinearSearchText(targetParagraphs[index]).includes(normalizedQuery)
    ));
}

export function getInterlinearSearchSuggestions(sourceParagraphs = [], targetParagraphs = [], query, limit = 5) {
  return findMatchingParagraphIndices(sourceParagraphs, targetParagraphs, query).slice(0, limit);
}
