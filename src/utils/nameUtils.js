const { distance } = require('fastest-levenshtein');

/**
 * Normalize a name for comparison: lowercase, trim, remove punctuation, collapse spaces.
 * @param {string} name
 * @returns {string}
 */
function normalizeName(name) {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize and reorder name tokens so "Smith Alex" and "Alex Smith" compare equal.
 * Sorts tokens alphabetically and joins with space.
 * @param {string} name
 * @returns {string}
 */
function normalizeForReordering(name) {
  const normalized = normalizeName(name);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.sort().join(' ');
}

/**
 * Compute similarity between two strings (0–1) using Levenshtein distance.
 * Handles spelling differences and missing letters.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function similarity(a, b) {
  const sa = String(a);
  const sb = String(b);
  if (sa === sb) return 1;
  if (!sa || !sb) return 0;
  const maxLen = Math.max(sa.length, sb.length);
  const d = distance(sa, sb);
  return 1 - d / maxLen;
}

/**
 * Compute similarity between two names with token reordering.
 * Uses normalized token-sorted form so "Alex Smith" matches "Smith Alex".
 * @param {string} name1
 * @param {string} name2
 * @returns {number}
 */
function nameSimilarity(name1, name2) {
  const n1 = normalizeForReordering(name1);
  const n2 = normalizeForReordering(name2);
  return similarity(n1, n2);
}

module.exports = {
  normalizeName,
  normalizeForReordering,
  similarity,
  nameSimilarity,
};
