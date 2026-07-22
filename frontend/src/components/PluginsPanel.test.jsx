// @vitest-environment jsdom
import React from "react";
import { describe, it, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PluginsPanel from "./PluginsPanel";
import * as api from "../utils/api";

// Mock API module
vi.mock("../utils/api", () => ({
  getPlugins: vi.fn(),
  runPlugin: vi.fn(),
  getPluginLogs: vi.fn().mockResolvedValue({ logs: [] }),
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

describe("PluginsPanel Component Suite (#594)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getPlugins.mockResolvedValue({ plugins: mockPluginsList });
    api.getPluginLogs.mockResolvedValue({ logs: [] });
  });

  afterEach(() => {
    cleanup();
  });

  test("renders the plugins panel header title and plugin options", async () => {
    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText("Calculator").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Summarizer").length).toBeGreaterThan(0);
    });
  });

  test("executes plugin action successfully when run button is clicked", async () => {
    api.runPlugin.mockResolvedValue({ success: true, output: "42" });

    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText("Calculator").length).toBeGreaterThan(0);
    });

    const calcButton = screen.getAllByText("Calculator")[0];
    fireEvent.click(calcButton);

    const textarea = screen.getByPlaceholderText(/Enter input for Calculator.../i);
    fireEvent.change(textarea, { target: { value: "6 * 7" } });

    const runBtn = screen.getByRole("button", { name: /Run Calculator/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });
  });

  test("copies plugin output to clipboard and displays 'Copied!' feedback", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    api.runPlugin.mockResolvedValue({ success: true, output: "42" });

    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText("Calculator").length).toBeGreaterThan(0);
    });

    const calcButton = screen.getAllByText("Calculator")[0];
    fireEvent.click(calcButton);

    const textarea = screen.getByPlaceholderText(/Enter input for Calculator.../i);
    fireEvent.change(textarea, { target: { value: "6 * 7" } });

    const runBtn = screen.getByRole("button", { name: /Run Calculator/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole("button", { name: /Copy/i });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith("42");
    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument();
    });
  });

  test("renders the plugins panel header title and info tooltip icon", async () => {
    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

    expect(screen.getByText(/Plugins/i)).toBeInTheDocument();

    // Verify info button trigger renders
    const helpButton = screen.getByLabelText(/Plugins panel information description/i);
    expect(helpButton).toBeInTheDocument();
    expect(helpButton.textContent.trim()).toBe("i");

    // Verify tooltip text is rendered in DOM
    const helpText = screen.getByText(/Plugins Workspace Help:/i);
    expect(helpText).toBeInTheDocument();
  });
});

describe("PluginsPanel View State & Persistence Suite (#592)", () => {
  let store = {};

  beforeEach(() => {
    store = {};
    vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => store[key] || null);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
      store[key] = String(value);
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation((key) => {
      delete store[key];
    });

    api.getPlugins.mockResolvedValue({ plugins: mockPluginsList });
    api.getPluginLogs.mockResolvedValue({ logs: [] });
  });

  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it("renders plugins list in default expanded state", async () => {
    render(<PluginsPanel sessionId="test-session-1" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Calculator")).toBeInTheDocument();
      expect(screen.getByText("Summarizer")).toBeInTheDocument();
    });
  });

  it("toggles collapse state and persists boolean flag to localStorage", async () => {
    render(<PluginsPanel sessionId="test-session-2" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Calculator")).toBeInTheDocument());

    const toggleBtn = screen.getByLabelText("Collapse plugins section");
    fireEvent.click(toggleBtn);

    expect(localStorage.setItem).toHaveBeenCalledWith("plugins-panel-collapsed:test-session-2", "true");
    expect(screen.queryByText("Calculator")).not.toBeInTheDocument();

    const expandBtn = screen.getByLabelText("Expand plugins section");
    fireEvent.click(expandBtn);

    expect(localStorage.setItem).toHaveBeenCalledWith("plugins-panel-collapsed:test-session-2", "false");
    expect(screen.getByText("Calculator")).toBeInTheDocument();
  });

  it("loads collapsed view on mount if localStorage flag is true", async () => {
    store["plugins-panel-collapsed:test-session-3"] = "true";

    render(<PluginsPanel sessionId="test-session-3" onClose={vi.fn()} />);

    expect(screen.queryByText("Calculator")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Expand plugins section")).toBeInTheDocument();
  });

  it("persists active plugin selection and restores it on mount", async () => {
    store["plugins-panel-selected:test-session-4"] = "summarizer";

    render(<PluginsPanel sessionId="test-session-4" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Summarize provided text")).toBeInTheDocument();
    });

    const calcBtn = screen.getByText("Calculator");
    fireEvent.click(calcBtn);

    expect(localStorage.setItem).toHaveBeenCalledWith("plugins-panel-selected:test-session-4", "calculator");
    expect(screen.getByText("Basic math evaluation")).toBeInTheDocument();
  });
});