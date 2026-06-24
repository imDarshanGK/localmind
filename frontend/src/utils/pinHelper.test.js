import { describe, test, expect, beforeEach } from "vitest";
import { getPinnedSessions, toggleSessionPin } from "./pinHelper.js";

describe("pinHelper", () => {
  // Clear localStorage before each test to ensure a clean slate
  beforeEach(() => {
    localStorage.clear();
  });

  test("getPinnedSessions returns empty array initially", () => {
    const initialPins = getPinnedSessions();
    expect(initialPins).toEqual([]);
  });

  test("toggleSessionPin adds a new session", () => {
    const id1 = "session-1";
    const pinsAfterAdd = toggleSessionPin(id1);
    
    expect(pinsAfterAdd).toEqual([id1]);
    expect(getPinnedSessions()).toEqual([id1]);
  });

  test("toggleSessionPin removes an existing session", () => {
    const id1 = "session-1";
    
    // Add it first
    toggleSessionPin(id1);
    
    // Toggle it again to remove it
    const pinsAfterRemove = toggleSessionPin(id1);
    
    expect(pinsAfterRemove).toEqual([]);
    expect(getPinnedSessions()).toEqual([]);
  });

  test("supports multiple pinned sessions", () => {
    toggleSessionPin("session-A");
    toggleSessionPin("session-B");
    
    const finalPins = getPinnedSessions();
    expect(finalPins).toEqual(["session-A", "session-B"]);
  });
});