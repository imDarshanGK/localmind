// @vitest-environment jsdom
import React from "react";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
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
  TemplateIcon: () => <span data-testid="template-icon" />,
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

  describe("Search Refinement Badges (#633)", () => {
    test("renders semantic search refinement badge", () => {
      render(<StatusBar searchRefinement="semantic" model="llama3" />);
      const badge = screen.getByTestId("search-refinement-badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("Search: Semantic");
    });

    test("renders keyword search refinement badge", () => {
      render(<StatusBar searchRefinement="keyword" model="llama3" />);
      const badge = screen.getByTestId("search-refinement-badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("Search: Keyword");
    });

    test("renders hybrid search refinement badge", () => {
      render(<StatusBar searchRefinement="hybrid" model="llama3" />);
      const badge = screen.getByTestId("search-refinement-badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("Search: Hybrid");
    });

    test("handles object input format for searchRefinement", () => {
      render(<StatusBar searchRefinement={{ mode: "semantic" }} model="llama3" />);
      expect(screen.getByTestId("search-refinement-badge")).toHaveTextContent("Search: Semantic");
    });

    test("does not render search refinement badge when searchRefinement is null/undefined", () => {
      render(<StatusBar searchRefinement={null} model="llama3" />);
      expect(screen.queryByTestId("search-refinement-badge")).not.toBeInTheDocument();
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