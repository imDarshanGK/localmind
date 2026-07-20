// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// --- Core Functionality Tests ---
describe("Sidebar Component - Core Functionality", () => {
  const mockSessions = [
    { id: "1", title: "First Session", message_count: 2 },
    { id: "2", title: "Second Session", message_count: 0 },
  ];
  const mockModels = [{ name: "llama3" }, { name: "mistral" }];

  it("renders basic setup elements correctly", () => {
    render(
      <Sidebar
        sessions={mockSessions}
        currentSession="1"
        models={mockModels}
        model="llama3"
        language="en"
        onNewChat={vi.fn()}
        onLoadSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onModelChange={vi.fn()}
        onLanguageChange={vi.fn()}
      />
    );

    expect(screen.getByText("LocalMind")).toBeTruthy();
    expect(screen.getByText("First Session")).toBeTruthy();
    expect(screen.getByText("Second Session")).toBeTruthy();
  });

  it("filters sessions correctly based on search input", () => {
    render(
      <Sidebar
        sessions={mockSessions}
        currentSession="1"
        models={mockModels}
        model="llama3"
        language="en"
        onNewChat={vi.fn()}
        onLoadSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onModelChange={vi.fn()}
        onLanguageChange={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText("Search chats...");
    fireEvent.change(searchInput, { target: { value: "Second" } });

    expect(screen.queryByText("First Session")).toBeNull();
    expect(screen.getByText("Second Session")).toBeTruthy();
  });
});


// --- Copy Feedback Suite (#561) ---
describe("Sidebar Component - Copy Feedback (#561)", () => {
  const mockSessions = [
    { id: "1", title: "Copy Test Session", message_count: 2 },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("copies session title to clipboard and displays temporary copy feedback", () => {
    render(
      <Sidebar
        sessions={mockSessions}
        currentSession="1"
        models={[]}
        model="llama3"
        language="en"
        onNewChat={vi.fn()}
        onLoadSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onModelChange={vi.fn()}
        onLanguageChange={vi.fn()}
      />
    );

    const copyBtn = screen.getByRole("button", { name: /copy session title for copy test session/i });
    expect(copyBtn).toBeInTheDocument();

    // Click copy button
    fireEvent.click(copyBtn);

    // Verify clipboard API call
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Copy Test Session");

    // Verify visual feedback appears
    expect(screen.getByText("Copied!")).toBeInTheDocument();

    // Fast-forward 2 seconds inside act() to flush React state updates
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Verify feedback resets
    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
  });
});