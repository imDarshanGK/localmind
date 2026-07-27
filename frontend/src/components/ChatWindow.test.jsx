// @vitest-environment jsdom
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import ChatWindow from './ChatWindow';
import { exportSession } from '../utils/api';

expect.extend(jestDomMatchers);

// Mock Icons and API dependencies
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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// --- SUITE: TOOLTIP HELP (#549) ---
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

// --- SUITE: MOBILE LAYOUT & RESPONSIVENESS (#546) ---
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

// --- SUITE: KEYBOARD NAVIGATION & INPUT CONTROLS (#545) ---
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

// --- SUITE 1: REGRESSION SUITE (#751) ---
describe("ChatWindow Regression Suite (#751)", () => {
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

// --- SUITE 2: SKELETON LOADING SUITE (#542) ---
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

// --- SUITE 3: COPY FEEDBACK SUITE (#550 / #750) ---
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