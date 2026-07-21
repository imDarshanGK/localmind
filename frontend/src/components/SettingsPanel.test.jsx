// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SettingsPanel from "./SettingsPanel";

vi.mock("./Icons", () => ({
  SettingsIcon: () => <span data-testid="settings-icon" />,
}));

// Ensure DOM is cleared after every test run
afterEach(() => {
  cleanup();
});

describe("SettingsPanel - Loading Skeleton Suite (#575)", () => {
  const defaultSettings = {
    default_model: "llama3",
    default_language: "en",
    temperature: 0.7,
    max_history_turns: 10,
    rag_top_k: 4,
    theme: "dark",
  };

  it("renders loading skeletons when isLoading prop is true", () => {
    render(
      <SettingsPanel
        settings={defaultSettings}
        isLoading={true}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Skeleton element should exist
    expect(screen.getByTestId("settings-panel-skeleton")).toBeInTheDocument();

    // Actual form controls/options should NOT render while loading
    expect(screen.queryByText("Save Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Default Model")).not.toBeInTheDocument();
  });

  it("renders form fields correctly when isLoading is false", () => {
    render(
      <SettingsPanel
        settings={defaultSettings}
        isLoading={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Skeleton element should NOT exist
    expect(screen.queryByTestId("settings-panel-skeleton")).not.toBeInTheDocument();

    // Actual form controls should render
    expect(screen.getByText("Save Settings")).toBeInTheDocument();
    expect(screen.getByText("Default Model")).toBeInTheDocument();
  });

  it("triggers onSave callback with updated state when Save button is clicked", () => {
    const onSaveSpy = vi.fn();
    render(
      <SettingsPanel
        settings={defaultSettings}
        isLoading={false}
        onSave={onSaveSpy}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Save Settings"));
    expect(onSaveSpy).toHaveBeenCalledWith(defaultSettings);
  });
});