// @vitest-environment jsdom
import React from "react";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PluginsPanel from "./PluginsPanel";
import * as api from "../utils/api";

vi.mock("../utils/api", () => ({
  getPlugins: vi.fn(),
  runPlugin: vi.fn(),
}));

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
});