import assert from "assert";
import { hashSessionIdToColor, getSessionColor, setSessionColor, PALETTE } from "./colorHelper.js";

// Mock localStorage for the Node.js test environment
const mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, value) => { mockStorage[key] = String(value); },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { for (const k in mockStorage) delete mockStorage[k]; }
};

const hexPalette = PALETTE.map(p => p.hex);

// Test 1: Hash is deterministic (same ID -> same color)
const id1 = "session-12345";
const color1a = hashSessionIdToColor(id1);
const color1b = hashSessionIdToColor(id1);
assert.strictEqual(color1a, color1b, "Hashing the same session ID must produce the same color");

// Test 2: Output is always in the palette
const ids = ["abc", "123", "xyz-789", "", "another-session-id-with-long-text", "id-3"];
ids.forEach(id => {
  const color = hashSessionIdToColor(id);
  assert.ok(hexPalette.includes(color), `Color ${color} must be part of the palette`);
});

// Test 3: Manual override persists and overrides auto color
const sessionId = "test-session-override";
const autoColor = getSessionColor(sessionId);
assert.ok(hexPalette.includes(autoColor), "Default auto color should be in the palette");

// Override color
const overrideColor = hexPalette[5]; // Pick a color from palette
assert.notStrictEqual(autoColor, overrideColor, "Check our override color is different to ensure change is visible");

setSessionColor(sessionId, overrideColor);
const retrievedColor = getSessionColor(sessionId);
assert.strictEqual(retrievedColor, overrideColor, "Session color should be the manual override color");

console.log("All session color helper unit tests passed successfully!");
