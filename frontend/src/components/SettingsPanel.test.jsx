// @vitest-environment jsdom
import React from "react";
import { describe, test, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SettingsPanel from "./SettingsPanel";

vi.mock("./Icons", () => ({
  SettingsIcon: () => <span data-testid="settings-icon" />,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const mockSettings = {
  default_model: "llama3",
  default_language: "en",
  temperature: 0.7,
  max_history_turns: 10,
  rag_top_k: 4,
  rag_chunk_overlap: 50,
  theme: "dark",
  minimal_mode: false,
};

describe("SettingsPanel - Loading Skeleton Suite (#575)", () => {
  const defaultSettings = {
    default_model: "llama3",
    default_language: "en",
    temperature: 0.7,
    max_history_turns: 10,
    rag_top_k: 4,
    theme: "dark",
  };

  it("renders loading skeletons when isLoading prop is true", () => {
    render(
      <SettingsPanel
        settings={defaultSettings}
        isLoading={true}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Skeleton element should exist
    expect(screen.getByTestId("settings-panel-skeleton")).toBeInTheDocument();

    // Actual form controls/options should NOT render while loading
    expect(screen.queryByText("Save Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Default Model")).not.toBeInTheDocument();
  });

  it("renders form fields correctly when isLoading is false", () => {
    render(
      <SettingsPanel
        settings={defaultSettings}
        isLoading={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Skeleton element should NOT exist
    expect(screen.queryByTestId("settings-panel-skeleton")).not.toBeInTheDocument();

    // Actual form controls should render
    expect(screen.getByText("Save Settings")).toBeInTheDocument();
    expect(screen.getByText("Default Model")).toBeInTheDocument();
  });

  it("triggers onSave callback with updated state when Save button is clicked", () => {
    const onSaveSpy = vi.fn();
    render(
      <SettingsPanel
        settings={defaultSettings}
        isLoading={false}
        onSave={onSaveSpy}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Save Settings"));
    expect(onSaveSpy).toHaveBeenCalled();
  });
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

describe("SettingsPanel Keyboard Navigation Suite (#578)", () => {
  test("fires the onClose callback trigger instantly when the Escape key is pressed", () => {
    const mockOnClose = vi.fn();
    render(<SettingsPanel settings={mockSettings} onSave={vi.fn()} onClose={mockOnClose} />);

    // Simulates standard window keyboard Escape sequence tracking
    fireEvent.keyDown(window, { key: "Escape" });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
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