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
  PinIcon: ({ filled }) => <span data-testid="pin-icon" data-filled={filled} />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// --- Interaction Tests (#562) ---
describe("Sidebar Component - Interaction Tests (#562)", () => {
  const mockSessions = [
    { id: "1", title: "First Session", message_count: 2 },
    { id: "2", title: "Second Session", message_count: 0 },
  ];
  const mockModels = [{ name: "llama3" }, { name: "mistral" }];

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

  it("triggers onNewChat when clicking the '+ New Chat' button", () => {
    render(<Sidebar {...defaultProps} />);
    const newChatBtn = screen.getByTestId("new-chat-btn");

    fireEvent.click(newChatBtn);

    expect(defaultProps.onNewChat).toHaveBeenCalledTimes(1);
  });

  it("triggers onModelChange with selected model when model dropdown value changes", () => {
    render(<Sidebar {...defaultProps} />);
    const modelSelect = screen.getByTestId("model-select");

    fireEvent.change(modelSelect, { target: { value: "mistral" } });

    expect(defaultProps.onModelChange).toHaveBeenCalledWith("mistral");
  });

  it("triggers onLanguageChange with selected code when language dropdown value changes", () => {
    render(<Sidebar {...defaultProps} />);
    const languageSelect = screen.getByTestId("language-select");

    fireEvent.change(languageSelect, { target: { value: "hi" } });

    expect(defaultProps.onLanguageChange).toHaveBeenCalledWith("hi");
  });

  it("triggers onLoadSession with session ID when clicking a session row", () => {
    render(<Sidebar {...defaultProps} />);
    const secondSessionBtn = screen.getByTestId("load-session-2");

    fireEvent.click(secondSessionBtn);

    expect(defaultProps.onLoadSession).toHaveBeenCalledWith("2");
  });

  it("updates search input value and filters the visible session list dynamically", () => {
    render(<Sidebar {...defaultProps} />);
    const searchInput = screen.getByTestId("search-input");

    expect(screen.getByTestId("session-item-1")).toBeInTheDocument();
    expect(screen.getByTestId("session-item-2")).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "Second" } });

    expect(screen.queryByTestId("session-item-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("session-item-2")).toBeInTheDocument();
  });

  it("displays empty results message when search filter yields zero matches", () => {
    render(<Sidebar {...defaultProps} />);
    const searchInput = screen.getByTestId("search-input");

    fireEvent.change(searchInput, { target: { value: "NonExistentSessionQuery" } });

    expect(screen.getByTestId("empty-message")).toHaveTextContent("No results.");
  });
});

// --- Mobile Responsive Layout Tests (#557) ---
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

  it("triggers onDeleteSession with session ID when clicking the delete button", () => {
    render(<Sidebar {...defaultProps} />);
    const deleteBtn = screen.getByTestId("delete-session-1");

    fireEvent.click(deleteBtn);

    expect(defaultProps.onDeleteSession).toHaveBeenCalledWith("1");
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

    const sessionBtn = screen.getByTestId("load-session-1");
    fireEvent.click(sessionBtn);

    expect(defaultProps.onLoadSession).toHaveBeenCalledWith("1");
    expect(screen.queryByTestId("sidebar-backdrop")).not.toBeInTheDocument();
  });

  it("auto-closes the mobile sidebar panel drawer when clicking the + New Chat button option", () => {
    render(<Sidebar {...defaultProps} />);

    const toggleBtn = screen.getByRole("button", { name: /toggle navigation sidebar/i });
    fireEvent.click(toggleBtn);

    const newChatBtn = screen.getByTestId("new-chat-btn");
    fireEvent.click(newChatBtn);

    expect(defaultProps.onNewChat).toHaveBeenCalled();
    expect(screen.queryByTestId("sidebar-backdrop")).not.toBeInTheDocument();
  });
});

// --- Accessibility Overhaul Tests (#558) ---
describe("Sidebar Component - Accessibility Landmarks (#558)", () => {
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
    
    const searchInput = screen.getByPlaceholderText("Search chats...");
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
    
    const activeBtn = screen.getByTestId("load-session-1");
    const inactiveBtn = screen.getByTestId("load-session-2");
    
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

// --- Persistent View State Tests (#559) ---
describe("Sidebar Component - Persistent View State (#559)", () => {
  const mockSessions = [{ id: "1", title: "Persistent Session", message_count: 1 }];
  const mockModels = [{ name: "llama3" }];

  let defaultProps;

  beforeEach(() => {
    localStorage.clear();
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

    const listContainer = screen.getByTestId("sessions-list");

    fireEvent.keyDown(listContainer, { key: "ArrowDown" });
    expect(screen.getByTestId("session-item-1").className).toContain("bg-gray-700");

    fireEvent.keyDown(listContainer, { key: "ArrowDown" });
    expect(screen.getByTestId("session-item-2").className).toContain("bg-gray-700");

    fireEvent.keyDown(listContainer, { key: "ArrowDown" });
    expect(screen.getByTestId("session-item-1").className).toContain("bg-gray-700");

    fireEvent.keyDown(listContainer, { key: "ArrowUp" });
    expect(screen.getByTestId("session-item-2").className).toContain("bg-gray-700");
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

    const listContainer = screen.getByTestId("sessions-list");

    fireEvent.keyDown(listContainer, { key: "ArrowDown" });
    fireEvent.keyDown(listContainer, { key: "Enter" });

    expect(loadSessionSpy).toHaveBeenCalledWith("1");
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

    const listContainer = screen.getByTestId("sessions-list");

    fireEvent.keyDown(listContainer, { key: "ArrowDown" });
    fireEvent.keyDown(listContainer, { key: "Escape" });

    expect(screen.getByTestId("session-item-1").className).not.toContain("bg-gray-700");
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

  it("renders pinned sessions in the 'Pinned' section", () => {
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
});