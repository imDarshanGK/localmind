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

// FIXED (#584): Clean out the DOM matrix sandbox completely after every test run
afterEach(() => {
  cleanup();
});

describe("SettingsPanel Interaction Suite (#584)", () => {
  test("renders core settings form fields accurately with default prop values", () => {
    render(<SettingsPanel settings={mockSettings} onSave={vi.fn()} onClose={vi.fn()} />);
    
    // FIXED (#584): Replaced external jest-dom assertions with native DOM check elements
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