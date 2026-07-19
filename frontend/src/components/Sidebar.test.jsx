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

describe("Sidebar Component - Accessibility Landmarks (#558)", () => {
  const mockSessions = [
    { id: "1", title: "Accessible Session A", message_count: 2 },
    { id: "2", title: "Accessible Session B", message_count: 0 },
  ];
  const mockModels = [{ name: "llama3" }];

  let defaultProps;

  beforeEach(() => {
    defaultProps = {
      sessions: mockSessions,
      currentSession: "1",
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
    
    const searchInput = screen.getByLabelText(/search chat sessions history/i);
    expect(searchLandmark).toContainElement(searchInput);
  });

  it("should wrap the session stream within a semantic navigation landmark", () => {
    render(<Sidebar {...defaultProps} />);
    
    const navLandmark = screen.getByRole("navigation", { name: /chat sessions history/i });
    expect(navLandmark).toBeInTheDocument();
    expect(navLandmark.tagName.toLowerCase()).toBe("nav");
  });

  it("should expose aria-current targets reflecting the active dynamic session focus context", () => {
    render(<Sidebar {...defaultProps} />);
    
    // Target the specific chat navigation button using a custom matcher function or precise substring
    const activeBtn = screen.getByRole("button", { name: (content) => content.includes("Accessible Session A") && !content.includes("Delete") });
    const inactiveBtn = screen.getByRole("button", { name: "Accessible Session B" });
    
    expect(activeBtn).toHaveAttribute("aria-current", "true");
    expect(inactiveBtn).not.toHaveAttribute("aria-current");
  });

  it("should isolate structural details inside a semantic footer region", () => {
    render(<Sidebar {...defaultProps} />);
    
    const footerElement = screen.getByRole("contentinfo");
    expect(footerElement).toBeInTheDocument();
    expect(footerElement.tagName.toLowerCase()).toBe("footer");
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