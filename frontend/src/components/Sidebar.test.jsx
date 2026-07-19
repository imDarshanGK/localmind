// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Sidebar from "./Sidebar";

// Mock out structural icons to respect element boundaries safely
vi.mock("./Icons", () => ({
  AppLogoIcon: () => <span data-testid="logo-icon" />,
  ChatIcon: () => <span data-testid="chat-icon" />,
  LockIcon: () => <span data-testid="lock-icon" />,
  StarIcon: () => <span data-testid="star-icon" />,
}));

describe("Sidebar Component - Persistent View State (#559)", () => {
  const mockSessions = [
    { id: "1", title: "Persistent Chat A", message_count: 0 }
  ];
  const mockModels = [{ name: "llama3" }];

  let defaultProps;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();

    defaultProps = {
      sessions: mockSessions,
      currentSession: "",
      models: mockModels,
      model: "llama3",
      language: "en",
      onNewChat: vi.fn(),
      onLoadSession: vi.fn(),
      onDeleteSession: vi.fn(),
      onModelChange: vi.fn(),
      onLanguageChange: vi.fn(),
    };
  });

  // Explicitly unmount the component layout tree after each spec block run
  afterEach(() => {
    cleanup();
  });

  it("should default to an expanded state (w-64) when localStorage is empty", () => {
    const { container } = render(<Sidebar {...defaultProps} />);
    const rootDiv = container.firstChild;

    expect(rootDiv).toHaveClass("w-64");
    expect(screen.getByText("AI Model")).toBeInTheDocument();
  });

  it("should correctly initialize in a collapsed state if specified by localStorage", () => {
    localStorage.setItem("sidebar_expanded_state", JSON.stringify(false));
    
    const { container } = render(<Sidebar {...defaultProps} />);
    const rootDiv = container.firstChild;

    expect(rootDiv).toHaveClass("w-16");
    expect(screen.queryByText("AI Model")).not.toBeInTheDocument();
  });

  it("should update localStorage and change layout class when toggle button is clicked", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const { container } = render(<Sidebar {...defaultProps} />);
    const rootDiv = container.firstChild;

    // Verify initial expanded state
    expect(rootDiv).toHaveClass("w-64");

    // Click collapse button
    const toggleBtn = screen.getByRole("button", { name: /collapse sidebar/i });
    fireEvent.click(toggleBtn);

    // Assert layout updates to collapsed view
    expect(rootDiv).toHaveClass("w-16");
    expect(setItemSpy).toHaveBeenCalledWith("sidebar_expanded_state", JSON.stringify(false));

    // Click again to re-expand
    const expandBtn = screen.getByRole("button", { name: /expand sidebar/i });
    fireEvent.click(expandBtn);

    expect(rootDiv).toHaveClass("w-64");
    expect(setItemSpy).toHaveBeenCalledWith("sidebar_expanded_state", JSON.stringify(true));
  });
});