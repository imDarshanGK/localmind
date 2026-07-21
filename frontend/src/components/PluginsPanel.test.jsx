// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import PluginsPanel from "./PluginsPanel";
import * as api from "../utils/api";

// Mock API utilities
vi.mock("../utils/api", () => ({
  getPlugins: vi.fn(),
  runPlugin: vi.fn(),
}));

describe("PluginsPanel Tooltip Help Suite (#593)", () => {
  const mockPlugins = [
    { id: "calculator", name: "Calculator", icon: "calculator", description: "Performs math expressions" },
    { id: "summarizer", name: "Summarizer", icon: "summarizer", description: "Summarizes text" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    api.getPlugins.mockResolvedValue({ plugins: mockPlugins });
  });

  test("renders the plugins panel header title and info tooltip icon", async () => {
    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

    expect(screen.getByText("Plugins")).toBeDefined();

    // Verify info button trigger renders
    const helpButton = screen.getByLabelText(/Plugins panel information description/i);
    expect(helpButton).toBeDefined();
    expect(helpButton.textContent.trim()).toBe("i");

    // Verify tooltip text is rendered in DOM
    const helpText = screen.getByText(/Plugins Workspace Help:/i);
    expect(helpText).toBeDefined();
  });

  test("fetches and renders plugin list correctly", async () => {
    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

    await waitFor(() => {
      const calculatorButtons = screen.getAllByText("Calculator");
      expect(calculatorButtons.length).toBeGreaterThan(0);

      const summarizerButtons = screen.getAllByText("Summarizer");
      expect(summarizerButtons.length).toBeGreaterThan(0);
    });
  });

  test("executes plugin action successfully when run button is clicked", async () => {
    api.runPlugin.mockResolvedValue({ success: true, output: "42" });

    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText("Calculator").length).toBeGreaterThan(0);
    });

    // Select the plugin button
    const calcButton = screen.getAllByText("Calculator")[0];
    fireEvent.click(calcButton);

    // Enter input
    const textarea = screen.getByPlaceholderText(/Enter input for Calculator.../i);
    fireEvent.change(textarea, { target: { value: "6 * 7" } });

    // Run plugin
    const runBtn = screen.getByRole("button", { name: /Run Calculator/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeDefined();
    });
  });
});