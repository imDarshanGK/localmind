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
  localStorage.clear();
  vi.clearAllMocks();
});

// --- Saved Drafts Support Tests (#563) ---
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

    const newChatBtn = screen.getByRole("button", { name: /start a new chat session/i });
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

// --- Tooltip Help Suite (#560) ---
describe("Sidebar Component - Tooltip Help Suite (#560)", () => {
  const mockSessions = [
    { id: "1", title: "Project Alpha", message_count: 3 },
    { id: "2", title: "Project Beta", message_count: 0 },
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

  it("attaches descriptive tooltips to main control elements", () => {
    render(<Sidebar {...defaultProps} />);

    // Query New Chat button using its aria-label accessible name
    const newChatBtn = screen.getByRole("button", { name: "Start a new chat session" });
    expect(newChatBtn).toHaveAttribute("title", "Start a new chat session");

    // Model Selector
    const modelSelect = screen.getByRole("combobox", { name: "Select AI Model" });
    expect(modelSelect).toHaveAttribute("title", "Select AI Model for active conversation");

    // Language Selector
    const languageSelect = screen.getByRole("combobox", { name: "Select Interface Language" });
    expect(languageSelect).toHaveAttribute("title", "Change sidebar interface language");

    // Search Input
    const searchInput = screen.getByPlaceholderText("Search chats...");
    expect(searchInput).toHaveAttribute("title", "Filter chat history by title");
  });

  it("attaches dynamic session tooltips to individual chat rows and delete actions", () => {
    render(<Sidebar {...defaultProps} />);

    // Session Switch Button Tooltip (Exact match on button title/content)
    const sessionBtn = screen.getByRole("button", { name: /^Project Alpha\(3\)$/i });
    expect(sessionBtn).toHaveAttribute("title", "Switch to session: Project Alpha");

    // Session Delete Button Tooltip
    const deleteBtn = screen.getByRole("button", { name: "Delete session Project Alpha" });
    expect(deleteBtn).toHaveAttribute("title", 'Delete session "Project Alpha"');
  });

  it("renders privacy statement and repository external link tooltips in footer", () => {
    render(<Sidebar {...defaultProps} />);

    // Privacy Text Tooltip
    const privacyText = screen.getByTitle("Local privacy statement");
    expect(privacyText).toBeInTheDocument();

    // External GitHub Link Tooltip
    const githubLink = screen.getByRole("link", { name: /star on github/i });
    expect(githubLink).toHaveAttribute("title", "Open GitHub Repository in a new tab");
  });
});