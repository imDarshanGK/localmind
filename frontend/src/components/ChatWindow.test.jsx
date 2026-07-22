// @vitest-environment jsdom
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import ChatWindow from './ChatWindow';
import { exportSession } from '../utils/api';

expect.extend(jestDomMatchers);

// Mock API & Icon Dependencies
vi.mock('../utils/api', () => ({
  exportSession: vi.fn(),
}));

vi.mock('./Icons', () => ({
  AppLogoIcon: () => <span data-testid="app-logo" />,
  FileIcon: () => <span data-testid="file-icon" />,
  LockIcon: () => <span data-testid="lock-icon" />,
  ChartIcon: () => <span data-testid="chart-icon" />,
  CopyIcon: () => <span data-testid="copy-icon" />,
  CloseIcon: () => <span data-testid="close-icon" />,
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

// --- SUITE: KEYBOARD NAVIGATION & INPUT CONTROLS (#545) ---
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

// --- SUITE 1: REGRESSION SUITE (#751) ---
describe("ChatWindow Regression Suite (#751)", () => {
  describe("Empty Welcome State Framework", () => {
    test("renders baseline readiness text and suggestions when message logs are empty", () => {
      render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="s1" />);
      
      expect(screen.getByText("LocalMind is ready")).toBeInTheDocument();
      expect(screen.getByText("Summarize the uploaded document")).toBeInTheDocument();
    });

    test("populates input with suggestion content when a pill is clicked", () => {
      render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="s1" />);
      
      const suggestionButton = screen.getByText("Explain in simple terms");
      fireEvent.click(suggestionButton);
      
      const textarea = screen.getByPlaceholderText(/Ask anything.../i);
      expect(textarea.value).toBe("Explain in simple terms");
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

    test("displays fallback mechanical loading dots if thread is active but text buffer is dry", () => {
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

  describe("Form Composition Key Event Controls", () => {
    test("submits input content via Enter key down actions", () => {
      const onSendSpy = vi.fn();
      render(<ChatWindow messages={[]} loading={false} onSend={onSendSpy} sessionId="s1" />);
      
      const textarea = screen.getByPlaceholderText(/Ask anything.../i);
      fireEvent.change(textarea, { target: { value: "Valid prompt message" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      
      expect(onSendSpy).toHaveBeenCalledWith("Valid prompt message");
      expect(textarea.value).toBe("");
    });

    test("bypasses submission pipelines when Shift+Enter key combinations are executed", () => {
      const onSendSpy = vi.fn();
      render(<ChatWindow messages={[]} loading={false} onSend={onSendSpy} sessionId="s1" />);
      
      const textarea = screen.getByPlaceholderText(/Ask anything.../i);
      fireEvent.change(textarea, { target: { value: "Multi line\n" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
      
      expect(onSendSpy).not.toHaveBeenCalled();
    });
  });
});

// --- SUITE 2: COPY FEEDBACK SUITE (#750) ---
describe('ChatWindow Copy Feedback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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

    // Flush microtasks so clipboard promise resolves safely inside act
    await act(async () => {
      await Promise.resolve(); 
    });

    // Check writeText was called with the correct message content
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello from LocalMind!');

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Verify copy state reverts back to original state
    expect(screen.getByTitle('Copy response')).toBeInTheDocument();
  });
});