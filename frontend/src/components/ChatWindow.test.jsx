import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ChatWindow from "./ChatWindow";

// Mock the smooth scroll
window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe("ChatWindow Auto-scroll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockMessages = [
    { id: 1, role: "user", content: "Hello" },
    { id: 2, role: "assistant", content: "Hi there" }
  ];

  it("scrolls to bottom on initial load with messages", () => {
    render(<ChatWindow messages={mockMessages} sessionId="123" onSend={() => {}} />);
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("scrolls to bottom when a new message is added", () => {
    const { rerender } = render(<ChatWindow messages={mockMessages} sessionId="123" onSend={() => {}} />);
    vi.clearAllMocks(); // Clear initial scroll

    const newMessages = [...mockMessages, { id: 3, role: "user", content: "New message" }];
    rerender(<ChatWindow messages={newMessages} sessionId="123" onSend={() => {}} />);
    
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("does not scroll to bottom when editing an existing message", () => {
    const { rerender } = render(<ChatWindow messages={mockMessages} sessionId="123" onSend={() => {}} />);
    vi.clearAllMocks(); // Clear initial scroll

    // Simulate an edit on message id 2
    const editedMessages = [
      mockMessages[0],
      { id: 2, role: "assistant", content: "Hi there edited" }
    ];
    rerender(<ChatWindow messages={editedMessages} sessionId="123" onSend={() => {}} />);

    // Should NOT scroll because length is the same and not streaming
    expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls to bottom when the last message is streaming", () => {
    const { rerender } = render(<ChatWindow messages={mockMessages} sessionId="123" onSend={() => {}} />);
    vi.clearAllMocks(); // Clear initial scroll

    // Simulate streaming the last message
    const streamingMessages = [
      mockMessages[0],
      { id: 2, role: "assistant", content: "Hi there streaming...", streaming: true }
    ];
    rerender(<ChatWindow messages={streamingMessages} sessionId="123" onSend={() => {}} />);

    // Should scroll because it's streaming
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("scrolls to bottom when switching sessions", () => {
    const { rerender } = render(<ChatWindow messages={mockMessages} sessionId="123" onSend={() => {}} />);
    vi.clearAllMocks(); // Clear initial scroll

    // Switch to a different session with the same number of messages
    const otherMessages = [
      { id: 3, role: "user", content: "Other session" },
      { id: 4, role: "assistant", content: "Hello from other session" }
    ];
    rerender(<ChatWindow messages={otherMessages} sessionId="456" onSend={() => {}} />);

    // Should scroll because session changed
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
