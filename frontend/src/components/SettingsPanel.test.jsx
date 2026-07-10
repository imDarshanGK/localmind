// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, test, expect, vi, afterEach } from "vitest";
import SettingsPanel from "./SettingsPanel";
const mockSettings = {
  default_model: "llama3",
  default_language: "en",
  temperature: 0.7,
  max_history_turns: 10,
  rag_top_k: 4,
  theme: "dark",
};
afterEach(() => {
  cleanup();
});

describe("SettingsPanel Keyboard Navigation Suite (#578)", () => {
  test("fires the onClose callback trigger instantly when the Escape key is pressed", () => {
    const mockOnClose = vi.fn();
    render(<SettingsPanel settings={mockSettings} onSave={vi.fn()} onClose={mockOnClose} />);
    
    // Simulates standard window keyboard Escape sequence tracking
    fireEvent.keyDown(window, { key: "Escape" });
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});