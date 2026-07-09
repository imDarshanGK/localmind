// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, test, expect, vi, afterEach } from "vitest";
import SettingsPanel from "./SettingsPanel";

// Mock standard props setup payload
const mockSettings = {
  default_model: "llama3",
  default_language: "en",
  temperature: 0.7,
  rag_top_k: 4,
  rag_chunk_overlap: 50,
  theme: "dark",
  minimal_mode: false,
};

afterEach(() => {
  cleanup();
});

describe("SettingsPanel Inline Error Banner & Feature Integration Suite (#577)", () => {
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

  test("renders core settings form fields accurately with default prop values", () => {
    render(<SettingsPanel settings={mockSettings} onSave={vi.fn()} onClose={vi.fn()} />);
    
    expect(screen.getByText("Default Model")).toBeDefined();
    expect(screen.getByText("Default Language")).toBeDefined();
    expect(screen.getByDisplayValue("llama3")).toBeDefined();
  });

  test("updates local form state variables successfully when select values shift", () => {
    render(<SettingsPanel settings={mockSettings} onSave={vi.fn()} onClose={vi.fn()} />);
    
    const modelSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(modelSelect, { target: { value: "deepseek-r1" } });
    
    expect(modelSelect.value).toBe("deepseek-r1");
  });

  test("triggers parent submission callback payload successfully when clicking save action button", async () => {
    const mockOnSave = vi.fn().mockResolvedValue({});
    render(<SettingsPanel settings={mockSettings} onSave={mockOnSave} onClose={vi.fn()} />);
    
    const saveButton = screen.getByText("Save Settings");
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledTimes(1);
    });
  });

  test("triggers close panel callback wrapper cleanly when cancel button is fired", () => {
    const mockOnClose = vi.fn();
    render(<SettingsPanel settings={mockSettings} onSave={vi.fn()} onClose={mockOnClose} />);
    
    const cancelButton = screen.getByText("Cancel");
    fireEvent.click(cancelButton);
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});