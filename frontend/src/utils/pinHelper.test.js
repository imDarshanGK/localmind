import { describe, test, expect, beforeEach } from "vitest";
import { getPinnedSessions, toggleSessionPin } from "./pinHelper.js";

// Mock localStorage cleanly inside the test scope
let mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, value) => { mockStorage[key] = String(value); },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { mockStorage = {}; }
};

describe("Pin Helper Suite", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("returns an empty array initially when no sessions are pinned", () => {
    expect(getPinnedSessions()).toEqual([]);
  });

  test("adds a new session to the pinned list and persists it to storage", () => {
    const id1 = "session-1";
    const pinsAfterAdd = toggleSessionPin(id1);
    
    expect(pinsAfterAdd).toEqual([id1]);
    expect(getPinnedSessions()).toEqual([id1]);
  });

  test("removes an existing pinned session when toggled again", () => {
    const id1 = "session-1";
    
    // Pin it first
    toggleSessionPin(id1);
    
    // Unpin it
    const pinsAfterRemove = toggleSessionPin(id1);
    
    expect(pinsAfterRemove).toEqual([]);
    expect(getPinnedSessions()).toEqual([]);
  });

  test("supports pinning multiple sessions independently", () => {
    toggleSessionPin("session-A");
    toggleSessionPin("session-B");
    
    expect(getPinnedSessions()).toEqual(["session-A", "session-B"]);
  });
});