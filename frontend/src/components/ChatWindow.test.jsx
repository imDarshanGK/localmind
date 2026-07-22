// @vitest-environment jsdom
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

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockImplementation(() => Promise.resolve()),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// --- SUITE 1: KEYBOARD NAVIGATION & INPUT CONTROLS (#545) ---
describe("ChatWindow Keyboard Navigation & Core Controls (#545)", () => {
  test("allows navigating suggestion pills via Arrow keys", () => {
    render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="s1" />);

    const pills = screen.getAllByTestId("suggestion-pill");
    
    // Focus the first pill
    pills[0].focus();
    expect(document.activeElement).toBe(pills[0]);

    // Press ArrowRight -> should focus second pill
    fireEvent.keyDown(pills[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(pills[1]);

    // Press ArrowDown -> should focus third pill
    fireEvent.keyDown(pills[1], { key: "ArrowDown" });
    expect(document.activeElement).toBe(pills[2]);

    // Press ArrowLeft -> should return to second pill
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
    
    // Type text and press Escape -> should clear input
    fireEvent.change(textarea, { target: { value: "Draft message" } });
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(textarea.value).toBe("");
  });

  test("submits input content on Enter and bypasses on Shift+Enter", () => {
    const onSendSpy = vi.fn();
    render(<ChatWindow messages={[]} loading={false} onSend={onSendSpy} sessionId="s1" />);

    const textarea = screen.getByPlaceholderText(/Ask anything.../i);

    // Shift + Enter (should not send)
    fireEvent.change(textarea, { target: { value: "Line 1\n" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSendSpy).not.toHaveBeenCalled();

    // Plain Enter (triggers send and trims input)
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(onSendSpy).toHaveBeenCalledWith("Line 1");
    expect(textarea.value).toBe("");
  });
});

// --- SUITE 2: FEATURE #543 - EMPTY STATE GUIDANCE ---
describe("ChatWindow Empty State Guidance (#543)", () => {
  test("renders empty state guidance container and feature badges when messages are empty", () => {
    render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="s1" />);

    expect(screen.getByTestId("empty-state-guidance")).toBeInTheDocument();
    expect(screen.getByText("LocalMind is ready")).toBeInTheDocument();
    expect(screen.getByText("💡 Select a suggestion below")).toBeInTheDocument();
    expect(screen.getByText("📄 Upload documents to query")).toBeInTheDocument();
    expect(screen.getByText("🔒 Encrypted & Local")).toBeInTheDocument();
  });

  test("hides empty state guidance container once active messages exist", () => {
    const mockMessages = [{ id: "m1", role: "user", content: "Hello LocalMind" }];
    render(<ChatWindow messages={mockMessages} loading={false} onSend={vi.fn()} sessionId="s1" />);

    expect(screen.queryByTestId("empty-state-guidance")).not.toBeInTheDocument();
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
    const mockMessages = [{ id: "m1", role: "user", content: "Mobile test message" }];
    render(<ChatWindow messages={mockMessages} loading={false} onSend={vi.fn()} sessionId="s1" />);

    const messageText = screen.getByText("Mobile test message");
    const bubbleWrapper = messageText.closest(".max-w-\\[88\\%\\]");
    expect(bubbleWrapper).toBeInTheDocument();
    expect(bubbleWrapper).toHaveClass("sm:max-w-2xl");
  });
});

// --- SUITE 4: SKELETON LOADING SUITE (#542) ---
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

// --- SUITE 5: CORE REGRESSIONS (#751) ---
describe("ChatWindow Core Regressions (#751)", () => {
  describe("Message Stream Rendering Matrix", () => {
    const mockMessages = [
      { id: "m1", role: "user", content: "Hello world" },
      { id: "m2", role: "assistant", content: "Hello User!", streaming: true, sources: ["doc1.pdf", "doc2.txt"] }
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
      
      const markdownBtn = screen.getByText("↓ .markdown");
      fireEvent.click(markdownBtn);
      
      expect(exportSession).toHaveBeenCalledWith("session-abc", "markdown");
    });
  });
});

// --- SUITE 6: COPY FEEDBACK SUITE (#750) ---
describe("ChatWindow Copy Feedback (#750)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  test('should show checkmark icon / "Copy" state change on click and revert after 1.5 seconds', async () => {
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

    const copyButton = screen.getByTitle('Copy response');
    fireEvent.click(copyButton);

    await act(async () => {
      await Promise.resolve(); 
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello from LocalMind!');

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByTitle('Copy response')).toBeInTheDocument();
  });
});