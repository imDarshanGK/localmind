// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, test, expect, vi, afterEach } from "vitest";
import SettingsPanel from "./SettingsPanel";

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

describe("SettingsPanel Empty State & Guidance Suite (#576)", () => {
  test("renders empty guidance card view when an empty settings object is supplied", () => {
    render(<SettingsPanel settings={{}} onSave={vi.fn()} onClose={vi.fn()} />);
    
    expect(screen.getByText("No Profile Configuration Found")).toBeDefined();
    expect(screen.getByText("Load System Defaults")).toBeDefined();
  });

  test("renders standard parameters layout when data is properly provisioned", () => {
    const validSettings = { default_model: "llama3", default_language: "en" };
    render(<SettingsPanel settings={validSettings} onSave={vi.fn()} onClose={vi.fn()} />);
    
    expect(screen.queryByText("No Profile Configuration Found")).toBeNull();
    expect(screen.getByText("Default Model")).toBeDefined();
  });
});

describe("SettingsPanel Accessibility Landmarks & Validation Suite (#580)", () => {
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