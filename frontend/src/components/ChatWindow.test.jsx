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
}));

// Mock clipboard API functionality using Vitest utilities
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockImplementation(() => Promise.resolve()) },
});

// Mock window scroll layouts absent inside default jsdom configurations
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// --- SUITE 1: FEATURE #543 - EMPTY STATE GUIDANCE ---
describe("ChatWindow Empty State Guidance (#543)", () => {
  test("renders empty state guidance container and feature badges when messages are empty", () => {
    render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="s1" />);

    expect(screen.getByTestId("empty-state-guidance")).toBeInTheDocument();
    expect(screen.getByText("LocalMind is ready")).toBeInTheDocument();
    expect(screen.getByText("💡 Select a suggestion below")).toBeInTheDocument();
    expect(screen.getByText("📄 Upload documents to query")).toBeInTheDocument();
    expect(screen.getByText("🔒 Encrypted & Local")).toBeInTheDocument();
  });

  test("populates prompt input and focuses textarea when a suggestion pill is clicked", () => {
    render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="s1" />);
    
    const suggestionButton = screen.getByText("Explain in simple terms");
    fireEvent.click(suggestionButton);
    
    const textarea = screen.getByPlaceholderText(/Ask anything.../i);
    expect(textarea.value).toBe("Explain in simple terms");
  });

  test("hides empty state guidance container once active messages exist", () => {
    const mockMessages = [{ id: "m1", role: "user", content: "Hello LocalMind" }];
    render(<ChatWindow messages={mockMessages} loading={false} onSend={vi.fn()} sessionId="s1" />);

    expect(screen.queryByTestId("empty-state-guidance")).not.toBeInTheDocument();
  });
});

// --- SUITE 2: FEATURE #542 - SKELETON LOADING ---
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

// --- SUITE 3: GENERAL REGRESSIONS & INPUT CONTROLS ---
describe("ChatWindow Core Regressions", () => {
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