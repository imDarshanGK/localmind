// @vitest-environment jsdom
import { render, cleanup } from "@testing-library/react";
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

describe("SettingsPanel Responsive Layout Suite (#579)", () => {
  test("implements responsive class names for column flow adjustments", () => {
    const { container } = render(
      <SettingsPanel settings={mockSettings} onSave={vi.fn()} onClose={vi.fn()} />
    );
    
    // Verifies layout contains the necessary single to double column responsive breaks
    const gridDiv = container.querySelector(".grid");
    expect(gridDiv.className).toContain("grid-cols-1");
    expect(gridDiv.className).toContain("sm:grid-cols-2");
  });
});