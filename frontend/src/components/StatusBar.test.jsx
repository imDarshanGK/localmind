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
  /*  Export and Share Actions (#638)                                           */
  /* -------------------------------------------------------------------------- */
  describe("Export and Share Actions (#638)", () => {
    test("renders export and share buttons when handlers are provided", () => {
      const onExport = vi.fn();
      const onShare = vi.fn();

      render(<StatusBar model="llama3" onExport={onExport} onShare={onShare} />);

      const exportBtn = screen.getByTestId("btn-export");
      const shareBtn = screen.getByTestId("btn-share");

      expect(exportBtn).toBeInTheDocument();
      expect(shareBtn).toBeInTheDocument();

      fireEvent.click(exportBtn);
      expect(onExport).toHaveBeenCalledTimes(1);

      fireEvent.click(shareBtn);
      expect(onShare).toHaveBeenCalledTimes(1);
    });

    test("does not render export or share buttons when handlers are omitted", () => {
      render(<StatusBar model="llama3" />);
      expect(screen.queryByTestId("btn-export")).not.toBeInTheDocument();
      expect(screen.queryByTestId("btn-share")).not.toBeInTheDocument();
    });

    test("includes export and share inside contextual menu when handlers are provided", () => {
      const onExport = vi.fn();
      const onShare = vi.fn();

      render(<StatusBar model="llama3" onExport={onExport} onShare={onShare} />);

      fireEvent.click(screen.getByTestId("btn-context-menu"));

      const exportOption = screen.getByText("Export Chat");
      const shareOption = screen.getByText("Share Session");

      expect(exportOption).toBeInTheDocument();
      expect(shareOption).toBeInTheDocument();

      fireEvent.click(exportOption);
      expect(onExport).toHaveBeenCalledTimes(1);
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
        { id: "act-1", label: "Custom Action", onClick: handleAction }
      ];

      render(<StatusBar model="llama3" contextActions={contextActions} />);

      fireEvent.click(screen.getByTestId("btn-context-menu"));
      const actionItem = screen.getByText("Custom Action");
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