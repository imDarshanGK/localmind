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

// Mock icon components
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
  { id: "calculator", name: "Calculator", icon: "calculator", description: "Performs math evaluation" },
  { id: "summarizer", name: "Summarizer", icon: "summarizer", description: "Summarizes provided text" },
];

describe("PluginsPanel Interaction Tests (#595)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getPlugins.mockResolvedValue({ plugins: mockPluginsList });
    api.getPluginLogs.mockResolvedValue({ logs: [] });
  });

  afterEach(() => {
    cleanup();
  });

  test("fetches and renders plugin selection options on mount", async () => {
    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

    expect(screen.getByTestId("plugins-panel")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("plugin-btn-calculator")).toBeInTheDocument();
      expect(screen.getByTestId("plugin-btn-summarizer")).toBeInTheDocument();
    });
  });

  test("selecting a plugin displays its workspace and input area", async () => {
    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("plugin-btn-calculator")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("plugin-btn-calculator"));

    expect(screen.getByTestId("plugin-workspace")).toBeInTheDocument();
    expect(screen.getByText("Performs math evaluation")).toBeInTheDocument();
    expect(screen.getByTestId("plugin-input-textarea")).toBeInTheDocument();
    expect(screen.getByTestId("run-plugin-btn")).toBeDisabled();
  });

  test("typing input enables the run button and handles successful execution", async () => {
    api.runPlugin.mockResolvedValueOnce({ success: true, output: "42" });

    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("plugin-btn-calculator")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("plugin-btn-calculator"));

    const textarea = screen.getByTestId("plugin-input-textarea");
    fireEvent.change(textarea, { target: { value: "6 * 7" } });

    const runBtn = screen.getByTestId("run-plugin-btn");
    expect(runBtn).not.toBeDisabled();

    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(api.runPlugin).toHaveBeenCalledWith({
        plugin: "calculator",
        input: "6 * 7",
        session_id: "test-session",
      });
      expect(screen.getByTestId("plugin-output-display")).toHaveTextContent("42");
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
      expect(screen.getByTestId("plugin-btn-calculator")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("plugin-btn-calculator"));

    const textarea = screen.getByTestId("plugin-input-textarea");
    fireEvent.change(textarea, { target: { value: "6 * 7" } });

    const runBtn = screen.getByTestId("run-plugin-btn");
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-output-display")).toHaveTextContent("42");
    });

    const copyBtn = screen.getByRole("button", { name: /Copy/i });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith("42");
    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument();
    });
  });

  test("handles plugin execution failure and renders error message", async () => {
    api.runPlugin.mockResolvedValueOnce({ success: false, error: "Syntax Error in formula" });

    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("plugin-btn-calculator")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("plugin-btn-calculator"));

    const textarea = screen.getByTestId("plugin-input-textarea");
    fireEvent.change(textarea, { target: { value: "invalid expression" } });

    fireEvent.click(screen.getByTestId("run-plugin-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("plugin-error-message")).toHaveTextContent("Syntax Error in formula");
    });
  });

  test("triggers onClose callback when close button is clicked", async () => {
    const handleClose = vi.fn();
    render(<PluginsPanel sessionId="test-session" onClose={handleClose} />);

    fireEvent.click(screen.getByTestId("close-panel-btn"));

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  test("renders the plugins panel header title and info tooltip icon", async () => {
    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

    expect(screen.getByText(/Plugins Workspace/i)).toBeInTheDocument();

    const helpButton = screen.getByLabelText(/Plugins panel information description/i);
    expect(helpButton).toBeInTheDocument();
    expect(helpButton.textContent.trim()).toBe("i");

    const helpText = screen.getByText(/Plugins Workspace Help:/i);
    expect(helpText).toBeInTheDocument();
  });
});

describe("PluginsPanel Drag and Drop Suite (#604)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.getPlugins.mockResolvedValue({ plugins: mockPluginsList });
    api.getPluginLogs.mockResolvedValue({ logs: [] });
  });

  afterEach(() => {
    cleanup();
  });

  test("renders the plugins panel and plugin items", async () => {
    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-btn-calculator")).toBeInTheDocument();
      expect(screen.getByTestId("plugin-btn-summarizer")).toBeInTheDocument();
    });
  });

  test("reorders plugins on drag and drop and persists order to localStorage", async () => {
    render(<PluginsPanel sessionId="session-604" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-btn-calculator")).toBeInTheDocument();
      expect(screen.getByTestId("plugin-btn-summarizer")).toBeInTheDocument();
    });

    const firstPlugin = screen.getByTestId("plugin-btn-calculator");
    const secondPlugin = screen.getByTestId("plugin-btn-summarizer");

    const mockDataTransfer = {
      effectAllowed: "",
      dropEffect: "",
      setData: vi.fn(),
      getData: vi.fn(),
    };

    fireEvent.dragStart(firstPlugin, { dataTransfer: mockDataTransfer });
    fireEvent.dragOver(secondPlugin, { dataTransfer: mockDataTransfer });
    fireEvent.drop(secondPlugin, { dataTransfer: mockDataTransfer });

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
      const pluginItems = screen.getAllByTestId(/^plugin-btn-/);
      expect(pluginItems[0]).toHaveTextContent("Summarizer");
      expect(pluginItems[1]).toHaveTextContent("Calculator");
    });
  });
});

describe("PluginsPanel Export & Share Suite (#605)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getPlugins.mockResolvedValue({ plugins: mockPluginsList });
    api.getPluginLogs.mockResolvedValue({ logs: [] });
  });

  afterEach(() => {
    cleanup();
  });

  test("copies shareable plugin URL to clipboard on Share action", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<PluginsPanel sessionId="session-605" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-btn-calculator")).toBeInTheDocument();
    });

    const optionsBtn = screen.getByLabelText("Options for Calculator");
    fireEvent.click(optionsBtn);

    const shareBtn = screen.getByText("Share Plugin");
    fireEvent.click(shareBtn);

    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("plugin=calculator"));
    await waitFor(() => {
      expect(screen.getByTestId("action-notification")).toHaveTextContent("Copied share link for Calculator!");
    });
  });

  test("triggers JSON export download on Export Config action", async () => {
    const createElementSpy = vi.spyOn(document, "createElement");

    render(<PluginsPanel sessionId="session-605-export" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-btn-calculator")).toBeInTheDocument();
    });

    const optionsBtn = screen.getByLabelText("Options for Calculator");
    fireEvent.click(optionsBtn);

    const exportBtn = screen.getByText("Export Config");
    fireEvent.click(exportBtn);

    expect(createElementSpy).toHaveBeenCalledWith("a");
    await waitFor(() => {
      expect(screen.getByTestId("action-notification")).toHaveTextContent("Exported Calculator configuration.");
    });
  });
});

describe("PluginsPanel View State & Persistence Suite (#592)", () => {
  let store = {};

  beforeEach(() => {
    store = {};
    vi.restoreAllMocks();
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
      expect(screen.getByText("Summarizes provided text")).toBeInTheDocument();
    });

    const calcBtn = screen.getByText("Calculator");
    fireEvent.click(calcBtn);

    expect(localStorage.setItem).toHaveBeenCalledWith("plugins-panel-selected:test-session-4", "calculator");
    expect(screen.getByText("Performs math evaluation")).toBeInTheDocument();
  });
});