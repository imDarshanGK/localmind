import { test } from "node:test";
import assert from "node:assert";
import { normalizeText } from "./search.js";

// Helper function that replicates the filtering behavior of Sidebar.jsx
function filterSessions(sessions, searchQuery) {
  const normalizedSearch = normalizeText(searchQuery);
  return sessions.filter(s => {
    const normalizedTitle = normalizeText(s.title);
    return normalizedTitle.includes(normalizedSearch);
  });
}

// ─── Tests for normalizeText Helper ──────────────────────────────────────────

test("normalizeText - converts standard text to lowercase", () => {
  assert.strictEqual(normalizeText("HELLO WORLD"), "hello world");
  assert.strictEqual(normalizeText("JavaScript"), "javascript");
});

test("normalizeText - removes accents/diacritics", () => {
  assert.strictEqual(normalizeText("Résumé"), "resume");
  assert.strictEqual(normalizeText("Café"), "cafe");
  assert.strictEqual(normalizeText("École"), "ecole");
  assert.strictEqual(normalizeText("München"), "munchen");
  assert.strictEqual(normalizeText("Español"), "espanol");
});

test("normalizeText - handles null, undefined, and empty string gracefully", () => {
  assert.strictEqual(normalizeText(null), "");
  assert.strictEqual(normalizeText(undefined), "");
  assert.strictEqual(normalizeText(""), "");
});

test("normalizeText - handles non-string inputs safely", () => {
  assert.strictEqual(normalizeText(12345), "12345");
  assert.strictEqual(normalizeText(true), "true");
});


// ─── Tests for Session Filtering Behavior ─────────────────────────────────────

test("Session Filter - normal search matching", () => {
  const sessions = [
    { id: 1, title: "Getting Started" },
    { id: 2, title: "Python Tutorial" },
    { id: 3, title: "React Guide" }
  ];

  const results = filterSessions(sessions, "tutorial");
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].id, 2);
});

test("Session Filter - case-insensitive matching", () => {
  const sessions = [
    { id: 1, title: "React Guide" },
    { id: 2, title: "REACT TIPS" },
    { id: 3, title: "react components" }
  ];

  // Lowercase search matches uppercase and mixed-case titles
  const results1 = filterSessions(sessions, "react");
  assert.strictEqual(results1.length, 3);

  // Uppercase search matches lowercase and mixed-case titles
  const results2 = filterSessions(sessions, "REACT");
  assert.strictEqual(results2.length, 3);
});

test("Session Filter - safe handling of null, undefined, and empty titles", () => {
  const sessions = [
    { id: 1, title: null },
    { id: 2, title: undefined },
    { id: 3, title: "" },
    { id: 4, title: "Active Chat Session" }
  ];

  // Searching should not crash on null/undefined/empty titles
  const results = filterSessions(sessions, "chat");
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].id, 4);
});

test("Session Filter - accent-insensitive matching", () => {
  const sessions = [
    { id: 1, title: "Résumé" },
    { id: 2, title: "Café" },
    { id: 3, title: "École" },
    { id: 4, title: "Regular Chat" }
  ];

  // Searching "resume" matches "Résumé"
  const r1 = filterSessions(sessions, "resume");
  assert.strictEqual(r1.length, 1);
  assert.strictEqual(r1[0].id, 1);

  // Searching "cafe" matches "Café"
  const r2 = filterSessions(sessions, "cafe");
  assert.strictEqual(r2.length, 1);
  assert.strictEqual(r2[0].id, 2);

  // Searching "ecole" matches "École"
  const r3 = filterSessions(sessions, "ecole");
  assert.strictEqual(r3.length, 1);
  assert.strictEqual(r3[0].id, 3);

  // Searching with accent matches accented title (e.g. searching "résumé" matches "Résumé")
  const r4 = filterSessions(sessions, "résumé");
  assert.strictEqual(r4.length, 1);
  assert.strictEqual(r4[0].id, 1);
});

test("Session Filter - empty search query matches everything", () => {
  const sessions = [
    { id: 1, title: "Résumé" },
    { id: 2, title: "Café" },
    { id: 3, title: null }
  ];

  const results = filterSessions(sessions, "");
  assert.strictEqual(results.length, 3);
});
