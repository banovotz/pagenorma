export function normalizeInterlinearSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('hr-HR');
}

export function findMatchingParagraphIndices(
  sourceParagraphs: unknown[] = [],
  targetParagraphs: unknown[] = [],
  query: string,
  commentTexts: unknown[] = []
): number[] {
  const normalizedQuery = normalizeInterlinearSearchText(query).trim();
  const paragraphCount = Math.max(
    sourceParagraphs.length,
    targetParagraphs.length,
    commentTexts.length
  );

  if (!normalizedQuery) {
    return Array.from({ length: paragraphCount }, (_, index) => index);
  }

  return Array.from({ length: paragraphCount }, (_, index) => index)
    .filter(index => {
      const source = normalizeInterlinearSearchText(sourceParagraphs[index]);
      const target = normalizeInterlinearSearchText(targetParagraphs[index]);
      const comment = normalizeInterlinearSearchText(commentTexts[index]);
      return source.includes(normalizedQuery) ||
        target.includes(normalizedQuery) ||
        comment.includes(normalizedQuery);
    });
}

export function getInterlinearSearchSuggestions(
  sourceParagraphs: unknown[] = [],
  targetParagraphs: unknown[] = [],
  query: string,
  commentTexts: unknown[] = [],
  limit = 5
): number[] {
  return findMatchingParagraphIndices(
    sourceParagraphs,
    targetParagraphs,
    query,
    commentTexts
  ).slice(0, limit);
}
