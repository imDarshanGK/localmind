// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
}));

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
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