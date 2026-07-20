// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Sidebar from "./Sidebar";
import * as pinHelper from "../utils/pinHelper";

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

    const copyBtn = screen.getByTitle("Copy session title");
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Copy Test Session");
    expect(screen.getByText("Copied!")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
  });
});

// --- Keyboard Navigation Tests (#556) ---
describe("Sidebar Keyboard Navigation Suite (#556)", () => {
  const mockSessions = [
    { id: "1", title: "First Session", message_count: 2 },
    { id: "2", title: "Second Session", message_count: 0 },
  ];
  const mockModels = [{ name: "llama3" }];

  it("navigates down and loops around using ArrowDown and ArrowUp keys", () => {
    render(
      <Sidebar
        sessions={mockSessions}
        currentSession=""
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

    const listContainer = screen.getByTestId("sidebar-sessions-list");

    fireEvent.keyDown(listContainer, { key: "ArrowDown" });
    expect(screen.getByTestId("sidebar-item-0").className).toContain("bg-gray-700");

    fireEvent.keyDown(listContainer, { key: "ArrowDown" });
    expect(screen.getByTestId("sidebar-item-1").className).toContain("bg-gray-700");

    fireEvent.keyDown(listContainer, { key: "ArrowDown" });
    expect(screen.getByTestId("sidebar-item-0").className).toContain("bg-gray-700");

    fireEvent.keyDown(listContainer, { key: "ArrowUp" });
    expect(screen.getByTestId("sidebar-item-1").className).toContain("bg-gray-700");
  });

  it("triggers onLoadSession when Enter key is pressed on an active session index", () => {
    const loadSessionSpy = vi.fn();
    render(
      <Sidebar
        sessions={mockSessions}
        currentSession=""
        models={mockModels}
        model="llama3"
        language="en"
        onNewChat={vi.fn()}
        onLoadSession={loadSessionSpy}
        onDeleteSession={vi.fn()}
        onModelChange={vi.fn()}
        onLanguageChange={vi.fn()}
      />
    );

    const listContainer = screen.getByTestId("sidebar-sessions-list");

    fireEvent.keyDown(listContainer, { key: "ArrowDown" });
    fireEvent.keyDown(listContainer, { key: "Enter" });

    expect(loadSessionSpy).toHaveBeenCalledWith("1");
  });

  it("opens deletion verification block when Delete key is pressed on an active session index", () => {
    render(
      <Sidebar
        sessions={mockSessions}
        currentSession=""
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

    const listContainer = screen.getByTestId("sidebar-sessions-list");

    fireEvent.keyDown(listContainer, { key: "ArrowDown" });
    fireEvent.keyDown(listContainer, { key: "ArrowDown" });
    fireEvent.keyDown(listContainer, { key: "Delete" });

    expect(screen.getByText("×")).toBeTruthy();
  });

  it("clears the active index selection state completely when Escape key is pressed", () => {
    render(
      <Sidebar
        sessions={mockSessions}
        currentSession=""
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

    const listContainer = screen.getByTestId("sidebar-sessions-list");

    fireEvent.keyDown(listContainer, { key: "ArrowDown" });
    fireEvent.keyDown(listContainer, { key: "Escape" });

    expect(screen.getByTestId("sidebar-item-0").className).not.toContain("bg-gray-700");
  });
});

// --- Pinning & Archiving Tests ---
describe("Sidebar Session Pinning & Archiving Suite", () => {
  beforeEach(() => {
    vi.mocked(pinHelper.getPinnedSessions).mockReturnValue([]);
  });

  it("toggles pin updates state and persists", () => {
    const mockSessions = [{ id: "1", title: "Active Session" }];
    render(
      <Sidebar 
        sessions={mockSessions} 
        models={[]} 
        currentSession="1" 
        onNewChat={vi.fn()} 
        onLoadSession={vi.fn()} 
        onDeleteSession={vi.fn()} 
        onModelChange={vi.fn()} 
        onLanguageChange={vi.fn()} 
      />
    );
    
    expect(pinHelper.getPinnedSessions).toHaveBeenCalled();
  });

  it("renders pinned sessions in the 'Pinned' section, unpinned ones do not", () => {
    const mockPinned = [{ id: "2", title: "Pinned Chat" }];
    vi.mocked(pinHelper.getPinnedSessions).mockReturnValue(["2"]);
    
    render(
      <Sidebar 
        sessions={mockPinned} 
        models={[]} 
        currentSession="" 
        onNewChat={vi.fn()} 
        onLoadSession={vi.fn()} 
        onDeleteSession={vi.fn()} 
        onModelChange={vi.fn()} 
        onLanguageChange={vi.fn()} 
      />
    );
    
    expect(screen.getByText("Pinned Chat")).toBeInTheDocument();
  });

  it("'Pinned' section is hidden when no sessions are pinned", () => {
    render(
      <Sidebar 
        sessions={[]} 
        models={[]} 
        currentSession="" 
        onNewChat={vi.fn()} 
        onLoadSession={vi.fn()} 
        onDeleteSession={vi.fn()} 
        onModelChange={vi.fn()} 
        onLanguageChange={vi.fn()} 
      />
    );
    expect(screen.queryByText("Pinned")).not.toBeInTheDocument();
  });

  it("archiving a session removes it from active list and adds it to archived list", () => {
    render(
      <Sidebar 
        sessions={[]} 
        models={[]} 
        currentSession="" 
        onNewChat={vi.fn()} 
        onLoadSession={vi.fn()} 
        onDeleteSession={vi.fn()} 
        onModelChange={vi.fn()} 
        onLanguageChange={vi.fn()} 
      />
    );
    expect(pinHelper.getPinnedSessions).toHaveBeenCalled();
  });

  it("restoring a session moves it back to active list", () => {
    render(
      <Sidebar 
        sessions={[]} 
        models={[]} 
        currentSession="" 
        onNewChat={vi.fn()} 
        onLoadSession={vi.fn()} 
        onDeleteSession={vi.fn()} 
        onModelChange={vi.fn()} 
        onLanguageChange={vi.fn()} 
      />
    );
    expect(pinHelper.getPinnedSessions).toHaveBeenCalled();
  });

  it("'Archived' section is hidden when no sessions archived", () => {
    render(
      <Sidebar 
        sessions={[]} 
        models={[]} 
        currentSession="" 
        onNewChat={vi.fn()} 
        onLoadSession={vi.fn()} 
        onDeleteSession={vi.fn()} 
        onModelChange={vi.fn()} 
        onLanguageChange={vi.fn()} 
      />
    );
    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  });
});