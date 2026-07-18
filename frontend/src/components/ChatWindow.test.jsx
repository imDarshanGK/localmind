// @vitest-environment jsdom
import { describe, test, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ChatWindow from "./ChatWindow";
import { exportSession } from "../utils/api";

vi.mock("../utils/api", () => ({
  exportSession: vi.fn(),
}));

vi.mock("./Icons", () => ({
  AppLogoIcon: () => <span data-testid="app-logo-icon" />,
  FileIcon: () => <span data-testid="file-icon" />,
  LockIcon: () => <span data-testid="lock-icon" />,
}));

beforeEach(() => {
  // Mock window scroll layouts absent inside default jsdom configurations
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ChatWindow Regression Suite (#751)", () => {
  describe("Empty Welcome State Framework", () => {
    test("renders baseline readiness text and suggestions when message logs are empty", () => {
      render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="s1" />);
      
      expect(screen.getByText("LocalMind is ready")).toBeInTheDocument();
      expect(screen.getByText("Summarize the uploaded document")).toBeInTheDocument();
    });

    test("fires onSend with the exact suggestion content when a pill is clicked", () => {
      const onSendSpy = vi.fn();
      render(<ChatWindow messages={[]} loading={false} onSend={onSendSpy} sessionId="s1" />);
      
      const suggestionButton = screen.getByText("Explain in simple terms");
      fireEvent.click(suggestionButton);
      
      expect(onSendSpy).toHaveBeenCalledWith("Explain in simple terms");
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
      
      // Verify typing loader element is present
      expect(screen.getByText("typing...")).toBeInTheDocument();
      
      // Verify source attachments are rendered
      expect(screen.getByText("doc1.pdf")).toBeInTheDocument();
      expect(screen.getByText("doc2.txt")).toBeInTheDocument();
    });

    test("displays fallback mechanical loading dots if thread is active but text buffer is dry", () => {
      render(<ChatWindow messages={[]} loading={true} onSend={vi.fn()} sessionId="s1" />);
      
      // The local mind loader container renders when loading is true and no message is streaming
      expect(screen.getByText("LocalMind")).toBeInTheDocument();
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
      expect(textarea.value).toBe(""); // Input gets reset cleanly
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