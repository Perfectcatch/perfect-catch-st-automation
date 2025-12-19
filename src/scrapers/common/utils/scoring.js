/**
 * Shared text similarity and product scoring utilities
 */

/**
 * Calculate similarity between two strings using token overlap
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score between 0 and 1
 */
function similarity(a, b) {
  a = (a || "").toLowerCase();
  b = (b || "").toLowerCase();
  if (!a || !b) return 0;

  const aTokens = new Set(a.split(/\s+/));
  const bTokens = new Set(b.split(/\s+/));

  let overlap = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) overlap++;
  }

  return overlap / Math.max(aTokens.size, bTokens.size);
}

/**
 * Score a product item against a search query
 * @param {string} query - Search query
 * @param {Object} item - Product item with name, description, sku, etc.
 * @returns {number} Score between 0 and 1
 */
function scoreItem(query, item) {
  const base = (query || "").toLowerCase();
  const name = item.name || "";
  const desc = item.description || item.text || "";

  const nameScore = similarity(base, name);
  const descScore = similarity(base, desc);

  // Check if query terms appear in SKU/part numbers
  const codeBlob = `${item.sku || ""} ${item.mfgNumber || ""} ${item.cat || ""} ${item.item || ""}`.toLowerCase();
  const codeScore = base.split(/\s+/).some(w => w && codeBlob.includes(w)) ? 0.2 : 0;

  return (nameScore * 0.6) + (descScore * 0.2) + codeScore;
}

/**
 * Score and sort items by relevance
 * @param {string} query - Search query
 * @param {Array} items - Array of product items
 * @returns {Array} Sorted items with scores
 */
function scoreAndSort(query, items) {
  return items
    .map(item => ({
      ...item,
      score: Number(scoreItem(query, item).toFixed(3))
    }))
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

module.exports = {
  similarity,
  scoreItem,
  scoreAndSort
};
