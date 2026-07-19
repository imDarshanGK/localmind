// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Sidebar from "./Sidebar";

// Hoist utility function mocks to satisfy the Vitest compiler context safely
vi.mock("../utils/pinHelper", () => ({
  getPinnedSessions: vi.fn(() => []),
  toggleSessionPin: vi.fn(),
}));

vi.mock("../utils/archiveHelper", () => ({
  getArchivedSessions: vi.fn(() => []),
  toggleSessionArchive: vi.fn(),
}));

// Mock icon rendering targets using standard span nodes to respect HTML element constraints
vi.mock("./Icons", () => ({
  AppLogoIcon: () => <span data-testid="logo-icon" />,
  ChatIcon: () => <span data-testid="chat-icon" />,
  LockIcon: () => <span data-testid="lock-icon" />,
  StarIcon: () => <span data-testid="star-icon" />,
  PinIcon: ({ filled }) => <span data-testid="pin-icon" data-filled={filled} />,
}));

describe("Sidebar Component - Integrated Testing Suites", () => {
  const mockSessions = [
    { id: "1", title: "Accessible Session A", message_count: 2 },
    { id: "2", title: "Accessible Session B", message_count: 0 },
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

  afterEach(() => {
    cleanup();
  });

  // --- Accessibility Overhaul Tests (#558) ---
  describe("Accessibility Landmarks", () => {
    it("should render the root container as a complementary aside landmark", () => {
      render(<Sidebar {...defaultProps} />);
      const asideLandmark = screen.getByRole("complementary", { name: /chat management sidebar/i });
      expect(asideLandmark).toBeInTheDocument();
      expect(asideLandmark.tagName.toLowerCase()).toBe("aside");
    });

    it("should contain a dedicated search landmark region", () => {
      render(<Sidebar {...defaultProps} />);
      const searchLandmark = screen.getByRole("search");
      expect(searchLandmark).toBeInTheDocument();
    });
  });

  // --- Persistent View State Tests (#559) ---
  describe("Persistent View State", () => {
    it("should default to an expanded state (md:w-64) when localStorage is empty", () => {
      const { container } = render(<Sidebar {...defaultProps} />);
      const asideElement = container.querySelector("aside");

      expect(asideElement).toHaveClass("md:w-64");
      expect(screen.getByText("AI Model")).toBeInTheDocument();
    });

    it("should correctly initialize in a collapsed state if specified by localStorage", () => {
      localStorage.setItem("sidebar_expanded_state", JSON.stringify(false));
      
      const { container } = render(<Sidebar {...defaultProps} />);
      const asideElement = container.querySelector("aside");

      expect(asideElement).toHaveClass("md:w-16");
      expect(screen.queryByText("AI Model")).not.toBeInTheDocument();
    });

    it("should update localStorage and change layout class when toggle button is clicked", () => {
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
      const { container } = render(<Sidebar {...defaultProps} />);
      const asideElement = container.querySelector("aside");

      expect(asideElement).toHaveClass("md:w-64");

      // Click collapse button
      const toggleBtn = screen.getByRole("button", { name: /collapse sidebar/i });
      fireEvent.click(toggleBtn);

      expect(asideElement).toHaveClass("md:w-16");
      expect(setItemSpy).toHaveBeenCalledWith("sidebar_expanded_state", JSON.stringify(false));

      // Click again to re-expand
      const expandBtn = screen.getByRole("button", { name: /expand sidebar/i });
      fireEvent.click(expandBtn);

      expect(asideElement).toHaveClass("md:w-64");
      expect(setItemSpy).toHaveBeenCalledWith("sidebar_expanded_state", JSON.stringify(true));
    });
  });
});