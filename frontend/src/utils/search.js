/**
 * Normalizes text by converting to lowercase, removing accents/diacritics,
 * and handling null/undefined/non-string values gracefully.
 *
 * @param {*} text - The input value to normalize.
 * @returns {string} The normalized string.
 */
export function normalizeText(text) {
  if (text === null || text === undefined) {
    return "";
  }
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
