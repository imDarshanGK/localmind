// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
}));

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
    expect(bubbleWrapper).toHaveClass("sm:max-w-xl");
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