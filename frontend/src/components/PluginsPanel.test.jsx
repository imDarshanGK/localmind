// @vitest-environment jsdom
import React from "react";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PluginsPanel from "./PluginsPanel";
import * as api from "../utils/api";

// Mock API module
vi.mock("../utils/api", () => ({
  getPlugins: vi.fn(),
  runPlugin: vi.fn(),
}));

// Mock icons
vi.mock("./Icons", () => ({
  BracesIcon: () => <span data-testid="braces-icon" />,
  CalculatorIcon: () => <span data-testid="calculator-icon" />,
  CodeIcon: () => <span data-testid="code-icon" />,
  ErrorIcon: () => <span data-testid="error-icon" />,
  GlobeIcon: () => <span data-testid="globe-icon" />,
  PlugIcon: () => <span data-testid="plug-icon" />,
  SummaryIcon: () => <span data-testid="summary-icon" />,
  HashIcon: () => <span data-testid="hash-icon" />,
}));

const mockPluginsList = [
  { id: "calculator", name: "Calculator", icon: "calculator", description: "Basic math evaluation" },
  { id: "summarizer", name: "Summarizer", icon: "summarizer", description: "Summarize provided text" },
];

describe("PluginsPanel Drag and Drop Suite (#604)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.getPlugins.mockResolvedValue({ plugins: mockPluginsList });
  });

  afterEach(() => {
    cleanup();
  });

  test("renders the plugins panel and plugin items", async () => {
    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-item-calculator")).toBeInTheDocument();
      expect(screen.getByTestId("plugin-item-summarizer")).toBeInTheDocument();
    });
  });

  test("reorders plugins on drag and drop and persists order to localStorage", async () => {
    render(<PluginsPanel sessionId="session-604" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-item-calculator")).toBeInTheDocument();
      expect(screen.getByTestId("plugin-item-summarizer")).toBeInTheDocument();
    });

    const firstPlugin = screen.getByTestId("plugin-item-calculator");
    const secondPlugin = screen.getByTestId("plugin-item-summarizer");

    const mockDataTransfer = {
      effectAllowed: "",
      dropEffect: "",
      setData: vi.fn(),
      getData: vi.fn(),
    };

    // Simulate drag and drop interaction
    fireEvent.dragStart(firstPlugin);
    fireEvent.dragOver(secondPlugin);
    fireEvent.drop(secondPlugin);

    // Verify localStorage persistence
    const savedOrder = localStorage.getItem("plugins-panel-order:session-604");
    expect(savedOrder).toBe(JSON.stringify(["summarizer", "calculator"]));
  });

  test("restores custom plugin order from localStorage on mount", async () => {
    localStorage.setItem(
      "plugins-panel-order:session-604-restore",
      JSON.stringify(["summarizer", "calculator"])
    );

    render(<PluginsPanel sessionId="session-604-restore" onClose={vi.fn()} />);

    await waitFor(() => {
      const pluginItems = screen.getAllByTestId(/^plugin-item-/);
      expect(pluginItems[0]).toHaveTextContent("Summarizer");
      expect(pluginItems[1]).toHaveTextContent("Calculator");
    });
  });

  test("runs plugin action when selected and submitted", async () => {
    api.runPlugin.mockResolvedValue({ success: true, output: "42" });

    render(<PluginsPanel sessionId="session-run" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-item-calculator")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("plugin-item-calculator"));

    const textarea = screen.getByPlaceholderText(/Enter input for Calculator.../i);
    fireEvent.change(textarea, { target: { value: "6 * 7" } });

    const runBtn = screen.getByRole("button", { name: /Run Calculator/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });
  });
});