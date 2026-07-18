<<<<<<< HEAD
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import ChatWindow from "./ChatWindow";

expect.extend(jestDomMatchers);

describe("ChatWindow - Copy Feedback Feature", () => {
  const mockMessages = [
    { id: "msg-1", role: "user", content: "Hello" },
    { id: "msg-2", role: "assistant", content: "Hi there! I am LocalMind.", streaming: false }
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockImplementation(() => Promise.resolve()) },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should display a copy button on completed assistant messages", () => {
    render(<ChatWindow messages={mockMessages} loading={false} onSend={vi.fn()} sessionId="1" />);
    expect(screen.getByText("Copy")).toBeInTheDocument();
  });

  it("should update text to '✓ Copied!' and then revert after 2 seconds", async () => {
    render(<ChatWindow messages={mockMessages} loading={false} onSend={vi.fn()} sessionId="1" />);
    
    const copyButton = screen.getByText("Copy");
    fireEvent.click(copyButton);

    // 1. Flush the microtasks so the clipboard promise resolves and sets state
    await act(async () => {
      await Promise.resolve(); 
    });

    // 2. Verify the feedback text is instantly visible
    expect(screen.getByText("✓ Copied!")).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Hi there! I am LocalMind.");

    // 3. Fast-forward time by 2 seconds to check the reversion state
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText("Copy")).toBeInTheDocument();
=======
// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import ChatWindow from './ChatWindow';

// Mock clipboard API functionality using Vitest utilities
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockImplementation(() => Promise.resolve()) },
});

// Mock scrollIntoView since jsdom doesn't support layout functions
window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe('ChatWindow Copy Feedback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
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

    // Find and click the copy response button
    const copyButton = screen.getByTitle('Copy response');
    fireEvent.click(copyButton);

    // Check that writeText was called with the correct message content
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello from LocalMind!');

    // Fast-forward processing timers by 1.5 seconds
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Verify copy state reverts back to original state (showing the default icon title)
    expect(screen.getByTitle('Copy response')).toBeDefined();
>>>>>>> upstream/main
  });
});