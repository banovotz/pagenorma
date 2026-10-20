// ============================================================================
// SUPPORT SEARCH (support/ index page)
// ============================================================================
// Client-side full-text search over the support articles, powered by MiniSearch
// (assets/js/vendor/minisearch.js) with Porter stemming (vendor/stemmer.js).
// The document set is fetched from /assets/search/support-index.json, which is
// rendered at build time by Jekyll (support/search-index.json).
//
// Progressive enhancement: without JS the page still shows the category cards
// with all article links; the search UI never blocks them.
// ============================================================================

import MiniSearch from './vendor/minisearch.js';
import { stemmer } from './vendor/stemmer.js';

const INDEX_URL = new URL('../search/support-index.json', import.meta.url).href;
const DEBOUNCE_MS = 120;
const SNIPPET_BEFORE = 70;   // characters of context before the first match
const SNIPPET_AFTER = 150;   // characters of context after the first match

// Tiny English stop-word list. Deliberately short: full lists swallow useful
// support phrases ("my analysis did not start" should still match "not").
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'at', 'by', 'for', 'with',
  'about', 'into', 'through', 'during', 'to', 'in', 'on', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'it', 'its', 'this', 'that', 'these', 'those',
  'as', 'from', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'do',
  'does', 'did', 'i', 'you', 'your', 'we', 'our', 'they', 'them', 'their'
]);

// ---------------------------------------------------------------------------
// Query-time helpers
// ---------------------------------------------------------------------------

const decodeArea = document.createElement('textarea');

/** Decode HTML entities left behind by Jekyll's strip_html (&amp;, &#39; …). */
function decodeEntities(value) {
  decodeArea.innerHTML = value;
  return decodeArea.value;
}

/** Split a query into searchable terms: lowercase, unstemmed, stop-word free. */
function queryTerms(query) {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(term => term.length > 1 && !STOP_WORDS.has(term));
}

// ---------------------------------------------------------------------------
// Index construction (lazy — only once the user interacts with the box)
// ---------------------------------------------------------------------------

let indexPromise = null;

function buildIndex() {
  if (indexPromise) return indexPromise;

  indexPromise = fetch(INDEX_URL)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(docs => {
      // Store the decoded text on the document itself so snippets and term
      // lookup work on the same strings the index was built from.
      const documents = docs.map(doc => ({
        ...doc,
        text: decodeEntities(doc.text || ''),
        title: decodeEntities(doc.title || ''),
        description: decodeEntities(doc.description || ''),
        category: decodeEntities(doc.category || '')
      }));

    const index = new MiniSearch({
      fields: ['title', 'description', 'category', 'text'],
      storeFields: ['url', 'title', 'description', 'category', 'category_slug', 'text'],
      idField: 'url',
      processTerm: (term, _fieldName) => {
        const lower = term.toLowerCase();
        if (lower.length < 2 || STOP_WORDS.has(lower)) return null;
        return stemmer(lower);
      },
      searchOptions: {
        // Title hits rank far above body hits, description/category in between.
        boost: { title: 8, description: 3, category: 2, text: 1 },
        prefix: true,
        fuzzy: term => (term.length >= 5 ? 0.2 : 0),
        combineWith: 'AND'
      }
    });

    // A second, unstemmed copy of the index, used as a typo fallback: stemming
    // mangles misspellings ("setings" → "set") before fuzzy matching can reach
    // the real term ("settings"), so typos need edit distance on raw words.
    const rawIndex = new MiniSearch({
      fields: ['title', 'description', 'category', 'text'],
      storeFields: ['url'],
      idField: 'url',
      processTerm: (term, _fieldName) => {
        const lower = term.toLowerCase();
        if (lower.length < 2 || STOP_WORDS.has(lower)) return null;
        return lower;
      },
      searchOptions: {
        boost: { title: 8, description: 3, category: 2, text: 1 },
        prefix: true,
        fuzzy: term => (term.length >= 5 ? 0.2 : 0),
        combineWith: 'AND'
      }
    });

    index.addAll(documents);
    rawIndex.addAll(documents);
    return { index, rawIndex, documents };
    })
    .catch(error => {
      console.error('Support search: could not load the index.', error);
      indexPromise = null; // allow a retry on the next keystroke
      throw error;
    });

  return indexPromise;
}

// ---------------------------------------------------------------------------
// Snippets & highlighting
// ---------------------------------------------------------------------------

/** Build a plain-text snippet around the first occurrence of any query term. */
function makeSnippet(doc, terms) {
  const haystack = `${doc.title} ${doc.text}`;
  const lower = haystack.toLowerCase();
  let position = -1;

  for (const term of terms) {
    const found = lower.indexOf(term);
    if (found !== -1 && (position === -1 || found < position)) position = found;
  }
  if (position === -1) position = 0; // no literal hit (stemmed match) → leading text

  const start = Math.max(0, position - SNIPPET_BEFORE);
  const end = Math.min(haystack.length, position + SNIPPET_AFTER);
  return {
    text: haystack.slice(start, end).trim(),
    clippedStart: start > 0,
    clippedEnd: end < haystack.length
  };
}

/** Render the snippet as DOM nodes, wrapping term matches in <mark>. */
function renderSnippet(container, snippet, terms) {
  container.textContent = '';
  if (snippet.clippedStart) container.appendChild(document.createTextNode('… '));

  const regex = new RegExp(
    `(${terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'giu'
  );

  let lastIndex = 0;
  for (const match of snippet.text.matchAll(regex)) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(snippet.text.slice(lastIndex, match.index)));
    }
    const mark = document.createElement('mark');
    mark.textContent = match[0];
    container.appendChild(mark);
    lastIndex = match.index + match[0].length;
  }
  container.appendChild(document.createTextNode(snippet.text.slice(lastIndex)));

  if (snippet.clippedEnd) container.appendChild(document.createTextNode(' …'));
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------

const input = document.getElementById('support-search-input');
const status = document.getElementById('support-search-status');
const resultsList = document.getElementById('support-search-results');
const categoryGrid = document.getElementById('support-category-grid');

if (input && status && resultsList) {
  const params = new URLSearchParams(window.location.search);
  if (params.has('q')) input.value = params.get('q');

  let debounceTimer = null;

  function showCategories(show) {
    if (categoryGrid) categoryGrid.hidden = !show;
  }

  function syncUrl(query) {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    window.history.replaceState(null, '', url);
  }

  function renderResults(query) {
    const terms = queryTerms(query);

    if (!terms.length) {
      resultsList.textContent = '';
      resultsList.hidden = true;
      status.textContent = '';
      showCategories(true);
      syncUrl('');
      return;
    }

    status.textContent = 'Searching…';
    showCategories(false);

    buildIndex()
      .then(({ index, rawIndex, documents }) => {
        let results = index.search(terms.join(' '));

        // Typo fallback: stemming can mangle misspellings before fuzzy matching
        // gets a chance ("setings" → "set"), so retry on the unstemmed index
        // when the stemmed pass comes up empty.
        const isTypoFallback = results.length === 0;
        if (isTypoFallback) results = rawIndex.search(terms.join(' '));

        // Fuzzy hits from the raw index only stored their url — join the full
        // document back in for title/category/snippets.
        const byUrl = new Map(documents.map(doc => [doc.url, doc]));
        results = results
          .map(result => byUrl.get(result.url) || result)
          .slice(0, 12);
        resultsList.textContent = '';

        if (!results.length) {
          status.textContent = `No articles match “${query}”. Try fewer or different words.`;
          resultsList.hidden = true;
          syncUrl(query);
          return;
        }

        status.textContent = `${results.length} article${results.length === 1 ? '' : 's'} found`;

        for (const result of results) {
          const item = document.createElement('li');
          item.className = 'support-result';

          const link = document.createElement('a');
          link.href = result.url;
          link.textContent = result.title;
          item.appendChild(link);

          const category = document.createElement('p');
          category.className = 'support-result-category';
          category.textContent = result.category;
          item.appendChild(category);

          const snippet = makeSnippet(result, terms);
          const snippetEl = document.createElement('p');
          snippetEl.className = 'support-result-snippet';
          renderSnippet(snippetEl, snippet, terms);
          item.appendChild(snippetEl);

          resultsList.appendChild(item);
        }

        resultsList.hidden = false;
        syncUrl(query);
      })
      .catch(() => {
        status.textContent = 'Search is temporarily unavailable. Browse the categories below.';
        resultsList.hidden = true;
        showCategories(true);
      });
  }

  input.addEventListener('input', () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => renderResults(input.value.trim()), DEBOUNCE_MS);
  });

  // Warm the index as soon as the user shows intent (before the first keystroke
  // lands), so the first search feels instant.
  input.addEventListener('focus', () => { buildIndex().catch(() => {}); }, { once: true });

  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      input.value = '';
      renderResults('');
      input.blur();
    }
  });

  // Deep link: /support/?q=…
  if (input.value.trim()) renderResults(input.value.trim());
}
