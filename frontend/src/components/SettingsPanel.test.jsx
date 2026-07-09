// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
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

describe("SettingsPanel Inline Error Banner Suite (#577)", () => {
  test("avoids rendering an error banner container by default during steady state", () => {
    render(<SettingsPanel settings={mockSettings} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId("error-banner")).toBeNull();
  });

  test("triggers and renders the inline error banner box when validation or save promises collapse", async () => {
    const brokenSaveMock = vi.fn().mockRejectedValue(new Error("Database write connection failed."));
    render(<SettingsPanel settings={mockSettings} onSave={brokenSaveMock} onClose={vi.fn()} />);
    
    const saveBtn = screen.getByRole("button", { name: /save settings/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
      expect(screen.getByText(/Database write connection failed./i)).toBeDefined();
    });
  });
});