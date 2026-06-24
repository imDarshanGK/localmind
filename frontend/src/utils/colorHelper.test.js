import { describe, test, expect, beforeEach } from "vitest";
import { getSessionColor, setSessionColor, PALETTE } from "./colorHelper.js";

describe("colorHelper", () => {
  // Clear localStorage before each test so they don't interfere with one another
  beforeEach(() => {
    localStorage.clear();
  });

  test("Hashing is deterministic (same ID -> same color)", () => {
    const id = "session-12345";
    const color1 = getSessionColor(id);
    const color2 = getSessionColor(id);
    
    // Hashing the same session ID must produce the same exact Tailwind class
    expect(color1).toBe(color2);
  });

  test("Empty or missing IDs return a fallback gray color", () => {
    expect(getSessionColor("")).toBe("text-gray-500");
    expect(getSessionColor(null)).toBe("text-gray-500");
  });

  test("Manual override persists and overrides auto color", () => {
    const sessionId = "test-session-override";
    const autoColor = getSessionColor(sessionId);

    // Pick a hex color from our exported palette
    const overrideColor = PALETTE[0].hex; 
    
    // Ensure the override color is actually different from the auto color
    expect(autoColor).not.toBe(overrideColor);

    // Set the override
    setSessionColor(sessionId, overrideColor);
    
    // Retrieve the color again to ensure it stuck
    const retrievedColor = getSessionColor(sessionId);
    expect(retrievedColor).toBe(overrideColor);

    // Verify it was correctly written to the browser's localStorage
    const savedData = JSON.parse(localStorage.getItem("localmind_session_colors"));
    expect(savedData[sessionId]).toBe(overrideColor);
  });
});