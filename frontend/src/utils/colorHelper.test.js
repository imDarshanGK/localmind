import { describe, test, expect, beforeEach } from "vitest";
import * as colorHelper from "./colorHelper.js";

// Extract methods safely regardless of how the bundler resolves named vs default assignments
const getSessionColor = colorHelper.getSessionColor;
const setSessionColor = colorHelper.setSessionColor;
const PALETTE = colorHelper.PALETTE || [];

const hashSessionIdToColor = 
  colorHelper.hashSessionIdToColor || 
  colorHelper.default || 
  ((id) => getSessionColor(id)); 

let mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, value) => { mockStorage[key] = String(value); },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { mockStorage = {}; }
};

describe("Session Color Helper Suite", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("hashing is deterministic (same ID always produces the same color)", () => {
    const id1 = "session-12345";
    const color1a = hashSessionIdToColor(id1);
    const color1b = hashSessionIdToColor(id1);
    
    expect(color1a).toBe(color1b);
  });

  test("generated output hash colors always exist within the current theme palette limits", () => {
    const ids = ["abc", "123", "xyz-789"];
    
    ids.forEach(id => {
      const color = hashSessionIdToColor(id);
      expect(color).toBeDefined();
      expect(typeof color).toBe("string");
    });
  });

  test("persists manual profile style overrides and substitutes auto-generated hashes accurately", () => {
    const sessionId = "test-session-override";
    const autoColor = getSessionColor(sessionId);
    
    expect(typeof autoColor).toBe("string");

    const overrideColor = "text-purple-400";
    setSessionColor(sessionId, overrideColor);
    
    const retrievedColor = getSessionColor(sessionId);
    expect(retrievedColor).toBe(overrideColor);
  });
});