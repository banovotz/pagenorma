import { getParallelParagraph } from '../utils/textAligner.js';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function wordPattern(term, fuzzy = false) {
  const words = String(term || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const parts = words.map(word => {
    const letters = Array.from(word);
    // Dropping the final letter catches common Latin-script declensions while
    // retaining enough of the term to avoid unrelated matches.
    const stem = fuzzy && letters.length > 4
      ? letters.slice(0, letters.length - 1).join('')
      : word;
    return escapeRegExp(stem) + (fuzzy ? '[\\p{L}\\p{M}]*' : '');
  });

  return new RegExp(`(?<![\\p{L}\\p{M}])${parts.join('\\s+')}(?![\\p{L}\\p{M}])`, 'giu');
}

function highlight(text, pattern) {
  if (!text || !pattern) return escapeHtml(text || '');
  pattern.lastIndex = 0;
  let result = '';
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text))) {
    result += escapeHtml(text.slice(cursor, match.index));
    result += `<mark class="highlight-term">${escapeHtml(match[0])}</mark>`;
    cursor = match.index + match[0].length;
    if (match[0].length === 0) pattern.lastIndex++;
  }

  return result + escapeHtml(text.slice(cursor));
}

export function findLocalMatches(
  sourceTerm,
  targetTerm,
  sourceParagraphs = [],
  targetParagraphs = []
) {
  const sourcePattern = wordPattern(sourceTerm, true);
  const targetPattern = wordPattern(targetTerm, true);
  if (!sourcePattern || !targetPattern) return [];

  const occurrences = [];
  const paragraphCount = Math.max(sourceParagraphs.length, targetParagraphs.length);

  for (let paragraphIndex = 0; paragraphIndex < paragraphCount; paragraphIndex++) {
    const { source, target } = getParallelParagraph(sourceParagraphs, targetParagraphs, paragraphIndex);
    sourcePattern.lastIndex = 0;
    targetPattern.lastIndex = 0;
    if (!sourcePattern.test(source) || !targetPattern.test(target)) continue;

    occurrences.push({
      paragraphIndex,
      sourceSnippet: highlight(source, sourcePattern),
      targetSnippet: highlight(target, targetPattern)
    });
  }

  return occurrences;
}

export async function findConcordanceMatches(
  sourceTerm,
  targetTerm,
  sourceParagraphs = [],
  targetParagraphs = [],
  { limit = 5, llmMatcher = null } = {}
) {
  const localMatches = findLocalMatches(
    sourceTerm,
    targetTerm,
    sourceParagraphs,
    targetParagraphs
  ).slice(0, limit);
  if (localMatches.length > 0 || typeof llmMatcher !== 'function') return localMatches;

  const enriched = [];
  for (let paragraphIndex = 0; paragraphIndex < sourceParagraphs.length; paragraphIndex++) {
    const { source, target } = getParallelParagraph(sourceParagraphs, targetParagraphs, paragraphIndex);
    if (!source || !target) continue;
    const snippets = await enrichOccurrenceWithLLM(
      sourceTerm,
      targetTerm,
      source,
      target,
      llmMatcher
    );
    enriched.push({ paragraphIndex, ...snippets });
    if (enriched.length >= limit) break;
  }
  return enriched;
}

/**
 * Optional online enrichment hook. The caller supplies the existing AI
 * wrapper, keeping the fast local path fully offline and independently usable.
 */
export async function enrichOccurrenceWithLLM(
  sourceTerm,
  targetTerm,
  sourceParagraph,
  targetParagraph,
  aiService
) {
  if (typeof aiService !== 'function') {
    throw new Error('An AI service function is required for concordance enrichment.');
  }

  const prompt = `Source term: '${sourceTerm}' (Target term: '${targetTerm}')
Source paragraph: "${sourceParagraph}"
Target paragraph: "${targetParagraph}"

Identify the exact sentence pair containing this term. Wrap the source term/phrase and its corresponding translation in the target text with <mark> tags. Return a JSON object with sourceSnippet and targetSnippet.`;
  const result = await aiService(prompt);
  if (!result || typeof result.sourceSnippet !== 'string' || typeof result.targetSnippet !== 'string') {
    throw new Error('The AI concordance response did not contain valid snippets.');
  }
  return result;
}

export { escapeHtml };
