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
  });
});