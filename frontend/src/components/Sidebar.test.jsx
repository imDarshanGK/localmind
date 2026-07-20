// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Sidebar from "./Sidebar";

// Mock Icons to standard span elements for HTML testing compatibility
vi.mock("./Icons", () => ({
  AppLogoIcon: () => <span data-testid="logo-icon" />,
  ChatIcon: () => <span data-testid="chat-icon" />,
  LockIcon: () => <span data-testid="lock-icon" />,
  StarIcon: () => <span data-testid="star-icon" />,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe("Sidebar Component - Saved Drafts Support (#563)", () => {
  const defaultProps = {
    sessions: [],
    currentSession: "1",
    onNewChat: vi.fn(),
    onLoadSession: vi.fn(),
    onDeleteSession: vi.fn(),
    model: "llama3",
    models: [{ name: "llama3" }],
    onModelChange: vi.fn(),
    language: "en",
    onLanguageChange: vi.fn(),
  };

  it("renders 'Draft' badge when session object has `hasDraft: true` prop", () => {
    const mockSessions = [
      { id: "1", title: "Session with Draft Prop", message_count: 2, hasDraft: true },
      { id: "2", title: "Regular Session", message_count: 0, hasDraft: false },
    ];

    render(<Sidebar {...defaultProps} sessions={mockSessions} />);

    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.queryAllByText("Draft")).toHaveLength(1);
  });

  it("renders 'Draft' badge when draft exists in localStorage for session ID", () => {
    localStorage.setItem("draft_2", "This is an active unsaved draft message");

    const mockSessions = [
      { id: "1", title: "Session One", message_count: 1 },
      { id: "2", title: "Session Two", message_count: 3 },
    ];

    render(<Sidebar {...defaultProps} sessions={mockSessions} />);

    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("does not render 'Draft' badge when no session has saved drafts", () => {
    const mockSessions = [
      { id: "1", title: "Clean Session A", message_count: 1 },
      { id: "2", title: "Clean Session B", message_count: 0 },
    ];

    render(<Sidebar {...defaultProps} sessions={mockSessions} />);

    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
  });
});