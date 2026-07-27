// @vitest-environment jsdom
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import ChatWindow from './ChatWindow';

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

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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