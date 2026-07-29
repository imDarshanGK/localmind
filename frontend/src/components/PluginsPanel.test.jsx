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
  { id: "calculator", name: "Calculator", icon: "calculator", description: "Basic math evaluation" },
  { id: "summarizer", name: "Summarizer", icon: "summarizer", description: "Summarize provided text" },
];

describe("PluginsPanel Component Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getPlugins.mockResolvedValue({ plugins: mockPluginsList });
  });

  afterEach(() => {
    cleanup();
  });

  test("renders plugins list from API on mount", async () => {
    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-item-calculator")).toBeInTheDocument();
      expect(screen.getByTestId("plugin-item-summarizer")).toBeInTheDocument();
    });
  });

  test("runs plugin action when input is provided and submitted", async () => {
    api.runPlugin.mockResolvedValue({ success: true, output: "42" });

    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

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

describe("PluginsPanel Export & Share Suite (#605)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getPlugins.mockResolvedValue({ plugins: mockPluginsList });
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
      expect(screen.getByTestId("plugin-item-calculator")).toBeInTheDocument();
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
      expect(screen.getByTestId("plugin-item-calculator")).toBeInTheDocument();
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