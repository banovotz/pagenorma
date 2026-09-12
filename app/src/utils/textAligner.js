/**
 * Normalizes the two locally cached texts into paragraph arrays.
 * Paragraph indexes are intentionally stable so they can be used as the
 * lightweight alignment key throughout the offline concordance flow.
 */
export function splitIntoParagraphs(rawText) {
  if (!rawText) return [];

  return String(rawText)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n|\n/)
    .map(paragraph => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function createParagraphAligner(sourceText, targetText) {
  const source = splitIntoParagraphs(sourceText);
  const target = splitIntoParagraphs(targetText);

  return {
    source,
    target,
    getParallelParagraph(index) {
      return {
        source: source[index] || '',
        target: target[index] || ''
      };
    }
  };
}

export function getParallelParagraph(sourceParagraphs, targetParagraphs, index) {
  return {
    source: sourceParagraphs?.[index] || '',
    target: targetParagraphs?.[index] || ''
  };
}
