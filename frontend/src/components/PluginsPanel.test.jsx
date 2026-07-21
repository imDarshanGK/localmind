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

describe("PluginsPanel Component Suite (#594)", () => {
  const mockPlugins = [
    { id: "calculator", name: "Calculator", icon: "calculator", description: "Performs math expressions" },
    { id: "summarizer", name: "Summarizer", icon: "summarizer", description: "Summarizes text" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    api.getPlugins.mockResolvedValue({ plugins: mockPlugins });
  });

  test("renders the plugins panel header title and plugin options", async () => {
    render(<PluginsPanel sessionId="test-session" onClose={vi.fn()} />);

    expect(screen.getByText("Plugins")).toBeDefined();

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

    // Select the plugin
    const calcButton = screen.getAllByText("Calculator")[0];
    fireEvent.click(calcButton);

    // Enter input
    const textarea = screen.getByPlaceholderText(/Enter input for Calculator.../i);
    fireEvent.change(textarea, { target: { value: "6 * 7" } });

    // Click Run
    const runBtn = screen.getByRole("button", { name: /Run Calculator/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeDefined();
    });
  });

  test("copies plugin output to clipboard and displays 'Copied!' feedback", async () => {
    // Mock navigator.clipboard.writeText
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

    // Select plugin & run execution
    const calcButton = screen.getAllByText("Calculator")[0];
    fireEvent.click(calcButton);

    const textarea = screen.getByPlaceholderText(/Enter input for Calculator.../i);
    fireEvent.change(textarea, { target: { value: "6 * 7" } });

    const runBtn = screen.getByRole("button", { name: /Run Calculator/i });
    fireEvent.click(runBtn);

    // Verify output appears
    await waitFor(() => {
      expect(screen.getByText("42")).toBeDefined();
    });

    // Click Copy button
    const copyBtn = screen.getByRole("button", { name: /Copy/i });
    fireEvent.click(copyBtn);

    // Verify clipboard API call & UI feedback state
    expect(writeTextMock).toHaveBeenCalledWith("42");
    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeDefined();
    });
  });
});