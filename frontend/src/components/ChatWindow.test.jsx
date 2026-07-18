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
  });
});