// @vitest-environment jsdom
import React from "react";
import { describe, test, expect, afterEach, vi } from "vitest";
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

  /* -------------------------------------------------------------------------- */
  /*  Changelog Preview Badges (#636)                                           */
  /* -------------------------------------------------------------------------- */
  describe("Changelog Preview Badges (#636)", () => {
    test("renders changelog badge and opens popover on click", () => {
      render(
        <StatusBar 
          changelog={{ version: "v1.2.0", items: ["Added search mode", "Fixed status bar UI"] }} 
          model="llama3" 
        />
      );

      const badge = screen.getByTestId("changelog-badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("v1.2.0");

      fireEvent.click(badge);
      expect(screen.getByTestId("changelog-popover")).toBeInTheDocument();
      expect(screen.getByText("Added search mode")).toBeInTheDocument();
      expect(screen.getByText("Fixed status bar UI")).toBeInTheDocument();
    });

    test("handles array input format for changelog", () => {
      render(<StatusBar changelog={["Bug fix A", "Feature B"]} model="llama3" />);
      
      const badge = screen.getByTestId("changelog-badge");
      expect(badge).toBeInTheDocument();

      fireEvent.click(badge);
      expect(screen.getByText("Bug fix A")).toBeInTheDocument();
      expect(screen.getByText("Feature B")).toBeInTheDocument();
    });

    test("handles simple string input for changelog", () => {
      render(<StatusBar changelog="v2.0 Release Notes" model="llama3" />);
      
      const badge = screen.getByTestId("changelog-badge");
      fireEvent.click(badge);
      expect(screen.getByText("v2.0 Release Notes")).toBeInTheDocument();
    });

    test("does not render changelog badge when prop is null/undefined", () => {
      render(<StatusBar changelog={null} model="llama3" />);
      expect(screen.queryByTestId("changelog-badge")).not.toBeInTheDocument();
    });
  });

  describe("Favorite & Pin Support (#634)", () => {
    test("renders favorite button and handles toggle state", () => {
      const onToggleFavorite = vi.fn();
      const { rerender } = render(
        <StatusBar model="llama3" isFavorite={false} onToggleFavorite={onToggleFavorite} />
      );

      const favBtn = screen.getByTestId("btn-favorite");
      expect(favBtn).toHaveTextContent("☆");

      fireEvent.click(favBtn);
      expect(onToggleFavorite).toHaveBeenCalledTimes(1);

      rerender(<StatusBar model="llama3" isFavorite={true} onToggleFavorite={onToggleFavorite} />);
      expect(screen.getByTestId("btn-favorite")).toHaveTextContent("★");
    });

    test("renders pin button and handles toggle state", () => {
      const onTogglePin = vi.fn();
      const { rerender } = render(
        <StatusBar model="llama3" isPinned={false} onTogglePin={onTogglePin} />
      );

      const pinBtn = screen.getByTestId("btn-pin");
      expect(pinBtn).toHaveTextContent("📍");

      fireEvent.click(pinBtn);
      expect(onTogglePin).toHaveBeenCalledTimes(1);

      rerender(<StatusBar model="llama3" isPinned={true} onTogglePin={onTogglePin} />);
      expect(screen.getByTestId("btn-pin")).toHaveTextContent("📌");
    });

    test("does not render favorite or pin controls when handlers are omitted", () => {
      render(<StatusBar model="llama3" />);
      expect(screen.queryByTestId("btn-favorite")).not.toBeInTheDocument();
      expect(screen.queryByTestId("btn-pin")).not.toBeInTheDocument();
    });
  });

  describe("Contextual Action Menus (#635)", () => {
    test("toggles contextual action dropdown menu on button click", () => {
      render(<StatusBar model="llama3" />);
      
      expect(screen.queryByTestId("context-menu-dropdown")).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId("btn-context-menu"));
      expect(screen.getByTestId("context-menu-dropdown")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("btn-context-menu"));
      expect(screen.queryByTestId("context-menu-dropdown")).not.toBeInTheDocument();
    });

    test("renders custom contextual action items and executes callback", () => {
      const handleAction = vi.fn();
      const contextActions = [
        { id: "act-1", label: "Export Chat", onClick: handleAction }
      ];

      render(<StatusBar model="llama3" contextActions={contextActions} />);

      fireEvent.click(screen.getByTestId("btn-context-menu"));
      const actionItem = screen.getByText("Export Chat");
      expect(actionItem).toBeInTheDocument();

      fireEvent.click(actionItem);
      expect(handleAction).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("context-menu-dropdown")).not.toBeInTheDocument();
    });

    test("displays fallback when contextActions array is empty", () => {
      render(<StatusBar model="llama3" contextActions={[]} />);

      fireEvent.click(screen.getByTestId("btn-context-menu"));
      expect(screen.getByText("No contextual actions")).toBeInTheDocument();
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
    test("triggers action callbacks on button clicks", () => {
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