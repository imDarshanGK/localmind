// @vitest-environment jsdom
import React from "react";
import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import StatusBar from "./StatusBar";

// Mock Icon components
vi.mock("./Icons", () => ({
  AppLogoIcon: () => <span data-testid="app-logo-icon" />,
  BatchIcon: () => <span data-testid="batch-icon" />,
  DocumentsIcon: () => <span data-testid="documents-icon" />,
  LightningIcon: () => <span data-testid="lightning-icon" />,
  OfflineIcon: () => <span data-testid="offline-icon" />,
  OnlineIcon: () => <span data-testid="online-icon" />,
  PlugIcon: () => <span data-testid="plug-icon" />,
  SettingsIcon: () => <span data-testid="settings-icon" />,
  TrashIcon: () => <span data-testid="trash-icon" />,
}));

describe("StatusBar Component Suite", () => {
  const defaultProps = {
    ollamaOk: true,
    model: "llama3",
    docCount: 2,
    compatibility: ["v1.0", "Local"],
    onUpload: vi.fn(),
    onPlugins: vi.fn(),
    onSettings: vi.fn(),
    onClear: vi.fn(),
    useStream: true,
    onToggleStream: vi.fn(),
  };

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe("Compatibility Badges (#630)", () => {
    test("renders compatibility badges when array is provided", () => {
      render(<StatusBar {...defaultProps} compatibility={["v1.0", "Local", "Cloud"]} />);

      const badges = screen.getAllByTestId("compatibility-badge");
      expect(badges).toHaveLength(3);
      expect(screen.getByText("v1.0")).toBeInTheDocument();
      expect(screen.getByText("Local")).toBeInTheDocument();
      expect(screen.getByText("Cloud")).toBeInTheDocument();
    });

    test("renders single badge when string is provided", () => {
      render(<StatusBar {...defaultProps} compatibility="v2.0-Local" />);

      const badge = screen.getByTestId("compatibility-badge");
      expect(badge).toBeInTheDocument();
      expect(screen.getByText("v2.0-Local")).toBeInTheDocument();
    });

    test("handles object input format gracefully", () => {
      render(<StatusBar {...defaultProps} compatibility={{ env: "Local", ver: "v1" }} />);

      const badges = screen.getAllByTestId("compatibility-badge");
      expect(badges).toHaveLength(2);
      expect(screen.getByText("Local")).toBeInTheDocument();
      expect(screen.getByText("v1")).toBeInTheDocument();
    });

    test("does not render compatibility container if compatibility prop is null/undefined", () => {
      render(<StatusBar {...defaultProps} compatibility={null} />);

      expect(screen.queryByTestId("status-bar-compatibility")).not.toBeInTheDocument();
    });
  });

  describe("Status Indicator Badges", () => {
    test("renders online status badge when ollamaOk is true", () => {
      render(<StatusBar {...defaultProps} ollamaOk={true} />);

      expect(screen.getByText("online")).toBeInTheDocument();
      expect(screen.getByTestId("online-icon")).toBeInTheDocument();
    });

    test("renders offline status badge when ollamaOk is false", () => {
      render(<StatusBar {...defaultProps} ollamaOk={false} />);

      expect(screen.getByText("ollama offline")).toBeInTheDocument();
      expect(screen.getByTestId("offline-icon")).toBeInTheDocument();
    });

    test("renders document count badge when docCount > 0", () => {
      render(<StatusBar {...defaultProps} docCount={3} />);

      expect(screen.getByText("3 docs")).toBeInTheDocument();
    });

    test("pluralizes document label correctly for single vs multiple docs", () => {
      const { rerender } = render(<StatusBar {...defaultProps} docCount={1} />);
      expect(screen.getByText("1 doc")).toBeInTheDocument();

      rerender(<StatusBar {...defaultProps} docCount={5} />);
      expect(screen.getByText("5 docs")).toBeInTheDocument();
    });

    test("hides document count badge when docCount is 0", () => {
  render(<StatusBar {...defaultProps} docCount={0} />);

  // Use a stricter regex so it doesn't match the "Docs" action button
  expect(screen.queryByText(/\b0\s+docs?\b/i)).not.toBeInTheDocument();
  // Or check that no badge matching document count exists
  expect(screen.queryByText(/0 doc/i)).not.toBeInTheDocument();
});
  });

  describe("Action Buttons & Interactions", () => {
    test("triggers corresponding action callbacks on button clicks", () => {
      render(<StatusBar {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /Docs/i }));
      expect(defaultProps.onUpload).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: /Plugins/i }));
      expect(defaultProps.onPlugins).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: /Clear/i }));
      expect(defaultProps.onClear).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: /Settings/i }));
      expect(defaultProps.onSettings).toHaveBeenCalledTimes(1);
    });

    test("toggles stream mode button state correctly", () => {
      const { rerender } = render(<StatusBar {...defaultProps} useStream={true} />);

      const streamBtn = screen.getByRole("button", { name: /Stream/i });
      expect(streamBtn).toHaveAttribute("title", "Streaming ON");
      expect(screen.getByTestId("lightning-icon")).toBeInTheDocument();

      fireEvent.click(streamBtn);
      expect(defaultProps.onToggleStream).toHaveBeenCalledTimes(1);

      rerender(<StatusBar {...defaultProps} useStream={false} />);
      const batchBtn = screen.getByRole("button", { name: /Batch/i });
      expect(batchBtn).toHaveAttribute("title", "Streaming OFF");
      expect(screen.getByTestId("batch-icon")).toBeInTheDocument();
    });
  });
});