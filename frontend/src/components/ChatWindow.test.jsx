// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import ChatWindow from './ChatWindow';
import { exportSession } from '../utils/api';

expect.extend(jestDomMatchers);

// Mock API and Icon dependencies
vi.mock('../utils/api', () => ({
  exportSession: vi.fn(),
}));

vi.mock('./Icons', () => ({
  AppLogoIcon: () => <span data-testid="app-logo" />,
  FileIcon: () => <span data-testid="file-icon" />,
  LockIcon: () => <span data-testid="lock-icon" />,
  ChartIcon: () => <span data-testid="chart-icon" />,
  CloseIcon: () => <span data-testid="close-icon" />,
  CopyIcon: () => <span data-testid="copy-icon" />,
  PlusCircleIcon: () => <span data-testid="plus-icon" />,
  TemplateIcon: () => <span data-testid="template-icon" />,
}));

// Mock clipboard API functionality using Vitest utilities
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockImplementation(() => Promise.resolve()) },
});

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// --- SUITE: ACCESSIBILITY LANDMARKS (#547) ---
describe("ChatWindow Accessibility Landmarks (#547)", () => {
  test("renders main, log, search/export header, and form landmarks with appropriate aria attributes", () => {
    const mockMessages = [{ id: "m1", role: "user", content: "Accessibility Test" }];
    render(<ChatWindow messages={mockMessages} loading={false} onSend={vi.fn()} sessionId="s1" />);

    // Main workspace landmark
    expect(screen.getByRole("main", { name: "Chat Workspace" })).toBeInTheDocument();

    // Export header landmark
    expect(screen.getByRole("banner", { name: "Export options" })).toBeInTheDocument();

    // Messages log landmark
    expect(screen.getByRole("log", { name: "Chat messages history" })).toBeInTheDocument();

    // Message article item
    expect(screen.getByRole("article", { name: "User message" })).toBeInTheDocument();

    // Message input form landmark
    expect(screen.getByRole("form", { name: "Message composer" })).toBeInTheDocument();
  });

  test("triggers message send when composer form is submitted", () => {
    const onSendSpy = vi.fn();
    render(<ChatWindow messages={[]} loading={false} onSend={onSendSpy} sessionId="s1" />);

    const textarea = screen.getByRole("textbox", { name: "Type your message" });
    fireEvent.change(textarea, { target: { value: "Hello LocalMind" } });

    const sendButton = screen.getByRole("button", { name: "Send message" });
    fireEvent.click(sendButton);

    expect(onSendSpy).toHaveBeenCalledWith("Hello LocalMind");
  });
});

// --- SUITE: PERSISTENT VIEW STATE (#548) ---
describe("ChatWindow Persistent View State (#548)", () => {
  test("persists draft message to localStorage and restores it on initial load", () => {
    localStorage.setItem("localmind_draft_session-123", "Saved draft message");

    render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="session-123" />);

    const textarea = screen.getByRole("textbox", { name: "Type your message" });
    expect(textarea.value).toBe("Saved draft message");
  });

  test("updates draft message in localStorage as user types", () => {
    render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="session-123" />);

    const textarea = screen.getByRole("textbox", { name: "Type your message" });
    fireEvent.change(textarea, { target: { value: "Writing new draft" } });

    expect(localStorage.getItem("localmind_draft_session-123")).toBe("Writing new draft");
  });

  test("clears draft message from localStorage after sending", () => {
    const onSendSpy = vi.fn();
    render(<ChatWindow messages={[]} loading={false} onSend={onSendSpy} sessionId="session-123" />);

    const textarea = screen.getByRole("textbox", { name: "Type your message" });
    fireEvent.change(textarea, { target: { value: "Draft ready to send" } });

    const sendButton = screen.getByRole("button", { name: "Send message" });
    fireEvent.click(sendButton);

    expect(onSendSpy).toHaveBeenCalledWith("Draft ready to send");
    expect(localStorage.getItem("localmind_draft_session-123")).toBeNull();
  });

  test("persists search filter query in localStorage and restores it on render", () => {
    localStorage.setItem("localmind_search_session-123", "filter query");
    const mockMessages = [{ id: "m1", role: "user", content: "filter query result" }];

    render(<ChatWindow messages={mockMessages} loading={false} onSend={vi.fn()} sessionId="session-123" />);

    const searchInput = screen.getByRole("textbox", { name: "Search conversation messages" });
    expect(searchInput.value).toBe("filter query");
  });

  test("updates search filter query in localStorage as user types", () => {
    const mockMessages = [{ id: "m1", role: "user", content: "React testing" }];
    render(<ChatWindow messages={mockMessages} loading={false} onSend={vi.fn()} sessionId="session-123" />);

    const searchInput = screen.getByRole("textbox", { name: "Search conversation messages" });
    fireEvent.change(searchInput, { target: { value: "testing" } });

    expect(localStorage.getItem("localmind_search_session-123")).toBe("testing");
  });

  test("switches persistent draft state when sessionId changes", async () => {
    localStorage.setItem("localmind_draft_session-1", "Draft for Session 1");
    localStorage.setItem("localmind_draft_session-2", "Draft for Session 2");

    const { rerender } = render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="session-1" />);

    const textarea = screen.getByRole("textbox", { name: "Type your message" });
    expect(textarea.value).toBe("Draft for Session 1");

    await act(async () => {
      rerender(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="session-2" />);
    });

    expect(textarea.value).toBe("Draft for Session 2");
  });
});

// --- SUITE 1: FEATURE #543 - EMPTY STATE GUIDANCE ---
describe("ChatWindow Empty State Guidance (#543)", () => {
  test("renders empty state guidance container and feature badges when messages are empty", () => {
    render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="s1" />);

    expect(screen.getByText("LocalMind is ready")).toBeInTheDocument();
    expect(screen.getByText("💡 Select a suggestion below")).toBeInTheDocument();
    expect(screen.getByText("📄 Upload documents to query")).toBeInTheDocument();
    expect(screen.getByText("🔒 Encrypted & Local")).toBeInTheDocument();
  });

  test("hides empty state guidance container once active messages exist", () => {
    const mockMessages = [{ id: "m1", role: "user", content: "Hello LocalMind" }];
    render(<ChatWindow messages={mockMessages} loading={false} onSend={vi.fn()} sessionId="s1" />);

    expect(screen.queryByText("💡 Select a suggestion below")).not.toBeInTheDocument();
  });
});

// --- SUITE 2: TOOLTIP HELP (#549) ---
describe("ChatWindow Tooltip Help (#549)", () => {
  test("renders descriptive title tooltips on interactive and informative elements", () => {
    const mockMessages = [
      { id: "m1", role: "user", content: "Test query" },
      { id: "m2", role: "assistant", content: "Test response", sources: ["doc.pdf"] }
    ];

    render(<ChatWindow messages={mockMessages} loading={false} onSend={vi.fn()} sessionId="s1" />);

    // Export format buttons
    expect(screen.getByTitle("Export full conversation as .markdown")).toBeInTheDocument();
    expect(screen.getByTitle("Export full conversation as .json")).toBeInTheDocument();
    expect(screen.getByTitle("Export full conversation as .txt")).toBeInTheDocument();

    // Source badges
    expect(screen.getByTitle("Referenced document source: doc.pdf")).toBeInTheDocument();

    // Textarea input and send button
    expect(screen.getByTitle("Chat input area (Enter to send, Shift+Enter for new line)")).toBeInTheDocument();
    expect(screen.getByTitle("Send message (Enter)")).toBeInTheDocument();

    // Privacy notice
    expect(screen.getByTitle("Privacy notice: All data is processed locally on your device")).toBeInTheDocument();
  });

  test("renders prompt suggestion tooltips when message log is empty", () => {
    render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="s1" />);

    expect(screen.getByTitle('Insert prompt: "Summarize the uploaded document"')).toBeInTheDocument();
  });
});

// --- SUITE 3: MOBILE LAYOUT & RESPONSIVENESS (#546) ---
describe("ChatWindow Mobile Layout (#546)", () => {
  test("renders prompt suggestion grid with responsive single/double column classes", () => {
    render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="s1" />);

    const grid = screen.getByRole("group", { name: "Prompt suggestions" });
    expect(grid).toHaveClass("grid-cols-1");
    expect(grid).toHaveClass("sm:grid-cols-2");
  });

  test("applies responsive max-width classes to user and assistant messages", () => {
    const mockMessages = [
      { id: "m1", role: "user", content: "Mobile test message" }
    ];
    render(<ChatWindow messages={mockMessages} loading={false} onSend={vi.fn()} sessionId="s1" />);

    const messageText = screen.getByText("Mobile test message");
    const bubbleWrapper = messageText.closest(".max-w-\\[88\\%\\]");
    expect(bubbleWrapper).toBeInTheDocument();
    expect(bubbleWrapper).toHaveClass("sm:max-w-2xl");
  });
});

// --- SUITE 4: KEYBOARD NAVIGATION & INPUT CONTROLS (#545) ---
describe("ChatWindow Keyboard Navigation & Core Controls (#545)", () => {
  test("allows navigating suggestion pills via Arrow keys", () => {
    render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="s1" />);

    const pills = screen.getAllByTestId("suggestion-pill");
    
    pills[0].focus();
    expect(document.activeElement).toBe(pills[0]);

    fireEvent.keyDown(pills[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(pills[1]);

    fireEvent.keyDown(pills[1], { key: "ArrowDown" });
    expect(document.activeElement).toBe(pills[2]);

    fireEvent.keyDown(pills[2], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(pills[1]);
  });

  test("populates prompt input and shifts focus to textarea when suggestion pill is clicked", () => {
    render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="s1" />);

    const suggestion = screen.getByText("Explain in simple terms");
    fireEvent.click(suggestion);

    const textarea = screen.getByPlaceholderText(/Ask anything.../i);
    expect(textarea.value).toBe("Explain in simple terms");
  });

  test("clears input text or blurs focus when Escape key is pressed", () => {
    render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="s1" />);

    const textarea = screen.getByPlaceholderText(/Ask anything.../i);
    
    fireEvent.change(textarea, { target: { value: "Draft message" } });
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(textarea.value).toBe("");
  });

  test("submits input content on Enter and bypasses on Shift+Enter", () => {
    const onSendSpy = vi.fn();
    render(<ChatWindow messages={[]} loading={false} onSend={onSendSpy} sessionId="s1" />);

    const textarea = screen.getByPlaceholderText(/Ask anything.../i);

    fireEvent.change(textarea, { target: { value: "Line 1\n" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSendSpy).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(onSendSpy).toHaveBeenCalledWith("Line 1");
    expect(textarea.value).toBe("");
  });
});

// --- SUITE 5: SKELETON LOADING (#542) ---
describe("ChatWindow Skeleton Loading Tests (#542)", () => {
  test("renders loading skeleton when loading is true and no message is streaming", () => {
    render(<ChatWindow messages={[]} loading={true} onSend={vi.fn()} sessionId="test-1" />);

    expect(screen.getByTestId("message-skeleton")).toBeInTheDocument();
  });

  test("does not render skeleton when loading is false", () => {
    render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="test-1" />);

    expect(screen.queryByTestId("message-skeleton")).not.toBeInTheDocument();
  });
});

// --- SUITE 6: CORE REGRESSIONS (#751) ---
describe("ChatWindow Core Regressions (#751)", () => {
  describe("Empty Welcome State Framework", () => {
    test("renders baseline readiness text and suggestions when message logs are empty", () => {
      render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="s1" />);
      
      expect(screen.getByText("LocalMind is ready")).toBeInTheDocument();
      expect(screen.getByText("Summarize the uploaded document")).toBeInTheDocument();
    });
  });

  describe("Message Stream Rendering Matrix", () => {
    const mockMessages = [
      { id: "m1", role: "user", content: "Hello world" },
      { id: "m2", role: "assistant", content: "Hello User!", streaming: true, sources: [{ source: "doc1.pdf" }, { source: "doc2.txt" }] }
    ];

    test("accurately reflects user/assistant visual variations and maps document sources", () => {
      render(<ChatWindow messages={mockMessages} loading={false} onSend={vi.fn()} sessionId="s1" />);
      
      expect(screen.getByText("Hello world")).toBeInTheDocument();
      expect(screen.getByText("Hello User!")).toBeInTheDocument();
      expect(screen.getByText("typing...")).toBeInTheDocument();
      expect(screen.getByText("doc1.pdf")).toBeInTheDocument();
      expect(screen.getByText("doc2.txt")).toBeInTheDocument();
    });

    test("displays baseline indicators when thread is computing", () => {
      render(<ChatWindow messages={[]} loading={true} onSend={vi.fn()} sessionId="s1" />);
      expect(screen.getAllByText("LocalMind").length).toBeGreaterThan(0);
    });
  });

  describe("Data Utility Export Layer", () => {
    test("fires API export handler with specific format parameters", () => {
      const mockMessages = [{ id: "m1", role: "user", content: "Persist me" }];
      render(<ChatWindow messages={mockMessages} loading={false} onSend={vi.fn()} sessionId="session-abc" />);
      
      expect(screen.getByText("↓ .markdown")).toBeInTheDocument();
      fireEvent.click(screen.getByText("↓ .markdown"));
      
      expect(exportSession).toHaveBeenCalledWith("session-abc", "markdown");
    });
  });
});

// --- SUITE 7: COPY FEEDBACK SUITE (#550 / #750) ---
describe('ChatWindow Copy Feedback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  test('should invoke navigator.clipboard.writeText and temporarily update copy feedback state', async () => {
    const mockMessages = [
      { id: 'msg-1', role: 'assistant', content: 'Hello from LocalMind!', streaming: false }
    ];

    render(
      <ChatWindow 
        messages={mockMessages} 
        loading={false} 
        onSend={vi.fn()} 
        onDeleteMessage={vi.fn()} 
        onStop={vi.fn()} 
        sessionId="session-1" 
        minimalMode={false} 
      />
    );

    const copyButton = screen.getByTitle('Copy response to clipboard');
    fireEvent.click(copyButton);

    await act(async () => {
      await Promise.resolve(); 
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello from LocalMind!');

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByTitle('Copy response to clipboard')).toBeInTheDocument();
  });
});

// --- SUITE 8: INTERACTION TESTS (#551) ---
describe("ChatWindow Interaction Tests (#551)", () => {
  test("triggers onSend when clicking the Send button with non-empty input", () => {
    const onSendSpy = vi.fn();
    render(
      <ChatWindow
        messages={[]}
        loading={false}
        onSend={onSendSpy}
        sessionId="session-interaction"
      />
    );

    const textarea = screen.getByPlaceholderText(/Ask anything.../i);
    const sendButton = screen.getByRole("button", { name: /Send/i });

    expect(sendButton).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "Hello from interaction test" } });
    expect(sendButton).not.toBeDisabled();

    fireEvent.click(sendButton);

    expect(onSendSpy).toHaveBeenCalledWith("Hello from interaction test");
    expect(textarea.value).toBe("");
  });

  test("triggers onStop callback when computing and Stop button is clicked", () => {
    const onStopSpy = vi.fn();
    render(
      <ChatWindow
        messages={[]}
        loading={true}
        onSend={vi.fn()}
        onStop={onStopSpy}
        sessionId="session-interaction"
      />
    );

    const stopButton = screen.getByRole("button", { name: /Stop/i });
    expect(stopButton).toBeInTheDocument();

    fireEvent.click(stopButton);
    expect(onStopSpy).toHaveBeenCalledTimes(1);
  });

  test("filters rendered messages in real time based on search input", () => {
    const mockMessages = [
      { id: "msg-1", role: "user", content: "First query about Python" },
      { id: "msg-2", role: "assistant", content: "Here is Python explanation" },
      { id: "msg-3", role: "user", content: "Unrelated Docker text" }
    ];

    render(
      <ChatWindow
        messages={mockMessages}
        loading={false}
        onSend={vi.fn()}
        sessionId="session-interaction"
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search messages.../i);

    expect(screen.getByText("First query about Python")).toBeInTheDocument();
    expect(screen.getByText("Unrelated Docker text")).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "Python" } });

    expect(screen.getByText("First query about Python")).toBeInTheDocument();
    expect(screen.queryByText("Unrelated Docker text")).not.toBeInTheDocument();

    const clearBtn = screen.getByRole("button", { name: /Clear search/i });
    fireEvent.click(clearBtn);

    expect(screen.getByText("Unrelated Docker text")).toBeInTheDocument();
  });
});

// --- SUITE 9: SAVED DRAFTS (#552) ---
describe('ChatWindow Saved Drafts (#552)', () => {
  test('restores saved draft from localStorage on initial render', () => {
    localStorage.setItem('localmind_draft_session-1', 'Restored draft content');

    render(
      <ChatWindow
        messages={[]}
        loading={false}
        onSend={vi.fn()}
        sessionId="session-1"
      />
    );

    const textarea = screen.getByPlaceholderText(/Ask anything.../i);
    expect(textarea.value).toBe('Restored draft content');
  });

  test('persists typed input to localStorage in real-time', () => {
    render(
      <ChatWindow
        messages={[]}
        loading={false}
        onSend={vi.fn()}
        sessionId="session-1"
      />
    );

    const textarea = screen.getByPlaceholderText(/Ask anything.../i);
    fireEvent.change(textarea, { target: { value: 'Drafting a new prompt' } });

    expect(localStorage.getItem('localmind_draft_session-1')).toBe(
      'Drafting a new prompt'
    );
  });

  test('clears saved draft from localStorage after sending message', () => {
    const onSendSpy = vi.fn();
    render(
      <ChatWindow
        messages={[]}
        loading={false}
        onSend={onSendSpy}
        sessionId="session-1"
      />
    );

    const textarea = screen.getByPlaceholderText(/Ask anything.../i);
    fireEvent.change(textarea, { target: { value: 'Ready to submit' } });

    const sendButton = screen.getByRole('button', { name: /Send/i });
    fireEvent.click(sendButton);

    expect(onSendSpy).toHaveBeenCalledWith('Ready to submit');
    expect(localStorage.getItem('localmind_draft_session-1')).toBeNull();
  });

  test('switches draft content dynamically when sessionId changes', () => {
    localStorage.setItem('localmind_draft_session-A', 'Draft for Session A');
    localStorage.setItem('localmind_draft_session-B', 'Draft for Session B');

    const { rerender } = render(
      <ChatWindow
        messages={[]}
        loading={false}
        onSend={vi.fn()}
        sessionId="session-A"
      />
    );

    const textarea = screen.getByPlaceholderText(/Ask anything.../i);
    expect(textarea.value).toBe('Draft for Session A');

    rerender(
      <ChatWindow
        messages={[]}
        loading={false}
        onSend={vi.fn()}
        sessionId="session-B"
      />
    );

    expect(textarea.value).toBe('Draft for Session B');
  });
});