import assert from "assert";
import { getPinnedSessions, toggleSessionPin } from "./pinHelper.js";

// Mock localStorage for the Node.js test environment
const mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, value) => { mockStorage[key] = String(value); },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { for (const k in mockStorage) delete mockStorage[k]; }
};

// Test 1: getPinnedSessions returns empty array initially
const initialPins = getPinnedSessions();
assert.deepStrictEqual(initialPins, [], "Initial pinned sessions should be an empty array");

// Test 2: toggleSessionPin adds a new session
const id1 = "session-1";
const pinsAfterAdd = toggleSessionPin(id1);
assert.deepStrictEqual(pinsAfterAdd, [id1], "Toggling an unpinned session should add it to the pinned list");
assert.deepStrictEqual(getPinnedSessions(), [id1], "State should persist to localStorage");

// Test 3: toggleSessionPin removes an existing session
const pinsAfterRemove = toggleSessionPin(id1);
assert.deepStrictEqual(pinsAfterRemove, [], "Toggling a pinned session should remove it from the pinned list");
assert.deepStrictEqual(getPinnedSessions(), [], "Removal should persist to localStorage");

// Test 4: Multiple pins
toggleSessionPin("session-A");
toggleSessionPin("session-B");
const finalPins = getPinnedSessions();
assert.deepStrictEqual(finalPins, ["session-A", "session-B"], "Should support multiple pinned sessions");

console.log("All pin helper unit tests passed successfully!");
