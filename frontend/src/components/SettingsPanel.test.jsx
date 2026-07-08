// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
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

describe("SettingsPanel Accessibility Landmarks Suite (#580)", () => {
  test("renders with correct semantic section region and aria bindings", () => {
    render(<SettingsPanel settings={mockSettings} onSave={vi.fn()} onClose={vi.fn()} />);
    
    // Verifies the entire component is enclosed in a landmark region labeled by the title heading
    const section = screen.getByRole("region", { name: /settings/i });
    expect(section).toBeDefined();
  });

  test("associates form control fields cleanly to their accessibility labels", () => {
    render(<SettingsPanel settings={mockSettings} onSave={vi.fn()} onClose={vi.fn()} />);
    
    // Verifies the labels are programmatically associated with inputs using htmlFor / id
    expect(screen.getByLabelText("Default Model")).toBeDefined();
    expect(screen.getByLabelText("Default Language")).toBeDefined();
    expect(screen.getByLabelText(/temperature/i)).toBeDefined();
  });
});