// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import ChatWindow from './ChatWindow';

expect.extend(jestDomMatchers);

vi.mock('../utils/api', () => ({
  exportSession: vi.fn(),
}));

vi.mock('./Icons', () => ({
  AppLogoIcon: () => <span data-testid="app-logo" />,
  FileIcon: () => <span data-testid="file-icon" />,
  LockIcon: () => <span data-testid="lock-icon" />,
}));

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
    expect(screen.getByTitle("Export session history as .markdown")).toBeInTheDocument();
    expect(screen.getByTitle("Export session history as .json")).toBeInTheDocument();
    expect(screen.getByTitle("Export session history as .txt")).toBeInTheDocument();

    // Source badges
    expect(screen.getByTitle("Referenced source: doc.pdf")).toBeInTheDocument();

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