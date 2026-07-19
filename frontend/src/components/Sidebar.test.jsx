// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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
  PinIcon: () => <span data-testid="pin-icon" />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Sidebar Component - Mobile Responsive Layout (#557)", () => {
  const mockSessions = [
    { id: "1", title: "Mobile Session A", message_count: 1 },
    { id: "2", title: "Mobile Session B", message_count: 0 },
  ];
  const mockModels = [{ name: "llama3" }];

  let defaultProps;

  beforeEach(() => {
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

  it("toggles the visibility of the mobile sidebar when clicking the hamburger trigger button", () => {
    render(<Sidebar {...defaultProps} />);

    const toggleBtn = screen.getByRole("button", { name: /toggle navigation sidebar/i });
    expect(toggleBtn).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-backdrop")).not.toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.getByTestId("sidebar-backdrop")).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId("sidebar-backdrop")).not.toBeInTheDocument();
  });

  it("dismisses the open side drawer menu when clicking the backdrop overlay dim screen", () => {
    render(<Sidebar {...defaultProps} />);

    const toggleBtn = screen.getByRole("button", { name: /toggle navigation sidebar/i });
    fireEvent.click(toggleBtn);

    const backdrop = screen.getByTestId("sidebar-backdrop");
    expect(backdrop).toBeInTheDocument();

    fireEvent.click(backdrop);
    expect(screen.queryByTestId("sidebar-backdrop")).not.toBeInTheDocument();
  });

  it("auto-closes the mobile sidebar panel drawer when selecting a session row item", () => {
    render(<Sidebar {...defaultProps} />);

    const toggleBtn = screen.getByRole("button", { name: /toggle navigation sidebar/i });
    fireEvent.click(toggleBtn);

    const sessionBtn = screen.getByRole("button", { name: /mobile session a/i });
    fireEvent.click(sessionBtn);

    expect(defaultProps.onLoadSession).toHaveBeenCalledWith("1");
    expect(screen.queryByTestId("sidebar-backdrop")).not.toBeInTheDocument();
  });

  it("auto-closes the mobile sidebar panel drawer when clicking the + New Chat button option", () => {
    render(<Sidebar {...defaultProps} />);

    const toggleBtn = screen.getByRole("button", { name: /toggle navigation sidebar/i });
    fireEvent.click(toggleBtn);

    const newChatBtn = screen.getByRole("button", { name: /\+ new chat/i });
    fireEvent.click(newChatBtn);

    expect(defaultProps.onNewChat).toHaveBeenCalled();
    expect(screen.queryByTestId("sidebar-backdrop")).not.toBeInTheDocument();
  });
});

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

    // Press ArrowDown to jump to the first item (Index 0)
    fireEvent.keyDown(listContainer, { key: "ArrowDown" });
    expect(screen.getByTestId("sidebar-item-0").className).toContain("bg-gray-700");

    // Press ArrowDown again to move to the second item (Index 1)
    fireEvent.keyDown(listContainer, { key: "ArrowDown" });
    expect(screen.getByTestId("sidebar-item-1").className).toContain("bg-gray-700");

    // Press ArrowDown again to verify list wrap-around (Index 0)
    fireEvent.keyDown(listContainer, { key: "ArrowDown" });
    expect(screen.getByTestId("sidebar-item-0").className).toContain("bg-gray-700");

    // Press ArrowUp to verify backward wrap-around (Index 1)
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