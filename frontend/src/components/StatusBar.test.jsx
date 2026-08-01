// @vitest-environment jsdom
import React from "react";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import StatusBar from "./StatusBar";

// Mock icon components
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
  afterEach(() => {
    cleanup();
  });

  describe("Source Trust Indicator Badges (#632)", () => {
    test("renders trusted source badge when trustLevel is 'trusted' or 'verified'", () => {
      render(<StatusBar trustLevel="verified" model="llama3" />);
      const badge = screen.getByTestId("source-trust-badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("Trusted Source");
    });

    test("renders untrusted source badge when trustLevel is 'untrusted'", () => {
      render(<StatusBar trustLevel="untrusted" model="llama3" />);
      const badge = screen.getByTestId("source-trust-badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("Untrusted Source");
    });

    test("renders caution badge when trustLevel is 'caution' or 'medium'", () => {
      render(<StatusBar trustLevel="caution" model="llama3" />);
      const badge = screen.getByTestId("source-trust-badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("Caution Source");
    });

    test("handles object input format for trustLevel gracefully", () => {
      render(<StatusBar trustLevel={{ level: "trusted" }} model="llama3" />);
      expect(screen.getByTestId("source-trust-badge")).toHaveTextContent("Trusted Source");
    });

    test("does not render trust badge when trustLevel is null or undefined", () => {
      render(<StatusBar trustLevel={null} model="llama3" />);
      expect(screen.queryByTestId("source-trust-badge")).not.toBeInTheDocument();
    });
  });

  describe("Status Indicator Badges", () => {
    test("renders model label correctly", () => {
      render(<StatusBar model="mistral-7b" />);
      expect(screen.getByText("mistral-7b")).toBeInTheDocument();
    });

    test("renders online status badge when ollamaOk is true", () => {
      render(<StatusBar ollamaOk={true} model="llama3" />);
      expect(screen.getByText("online")).toBeInTheDocument();
    });

    test("renders offline status badge when ollamaOk is false", () => {
      render(<StatusBar ollamaOk={false} model="llama3" />);
      expect(screen.getByText("ollama offline")).toBeInTheDocument();
    });

    test("renders document count badge when docCount > 0", () => {
      render(<StatusBar docCount={3} model="llama3" />);
      expect(screen.getByText("3 docs")).toBeInTheDocument();
    });

    test("pluralizes document label correctly for single vs multiple docs", () => {
      render(<StatusBar docCount={1} model="llama3" />);
      expect(screen.getByText("1 doc")).toBeInTheDocument();
    });

    test("hides document count badge when docCount is 0", () => {
      render(<StatusBar docCount={0} model="llama3" />);
      expect(screen.queryByTestId("doc-count-badge")).not.toBeInTheDocument();
    });
  });

  describe("Action Buttons & Interactions", () => {
    test("triggers corresponding action callbacks on button clicks", () => {
      const onUpload = vi.fn();
      const onPlugins = vi.fn();
      const onSettings = vi.fn();
      const onClear = vi.fn();

      render(
        <StatusBar
          model="llama3"
          onUpload={onUpload}
          onPlugins={onPlugins}
          onSettings={onSettings}
          onClear={onClear}
        />
      );

      fireEvent.click(screen.getByTestId("btn-docs"));
      expect(onUpload).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId("btn-plugins"));
      expect(onPlugins).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId("btn-settings"));
      expect(onSettings).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId("btn-clear"));
      expect(onClear).toHaveBeenCalledTimes(1);
    });

    test("toggles stream mode button state correctly", () => {
      const onToggleStream = vi.fn();
      const { rerender } = render(
        <StatusBar useStream={false} onToggleStream={onToggleStream} model="llama3" />
      );

      expect(screen.getByText("Batch")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("btn-stream"));
      expect(onToggleStream).toHaveBeenCalledTimes(1);

      rerender(<StatusBar useStream={true} onToggleStream={onToggleStream} model="llama3" />);
      expect(screen.getByText("Stream")).toBeInTheDocument();
    });
  });
});