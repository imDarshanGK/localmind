// @vitest-environment jsdom
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import ChatWindow from './ChatWindow';
import { exportSession } from '../utils/api';

expect.extend(jestDomMatchers);

// Mock API utility
vi.mock('../utils/api', () => ({
  exportSession: vi.fn(),
}));

// Mock Icons used in ChatWindow
vi.mock('./Icons', () => ({
  AppLogoIcon: () => <span data-testid="app-logo" />,
  FileIcon: () => <span data-testid="file-icon" />,
  LockIcon: () => <span data-testid="lock-icon" />,
}));

// Mock clipboard API functionality
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockImplementation(() => Promise.resolve()) },
});

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// --- SUITE: COPY FEEDBACK (#550) ---
describe('ChatWindow Copy Feedback (#550)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  test('should invoke navigator.clipboard.writeText on copy click', async () => {
    const mockMessages = [
      { id: 'msg-1', role: 'assistant', content: 'Sample assistant response', streaming: false }
    ];

    render(
      <ChatWindow 
        messages={mockMessages} 
        loading={false} 
        onSend={vi.fn()} 
        sessionId="session-1" 
      />
    );

    const copyButton = screen.getByTitle('Copy response to clipboard');
    fireEvent.click(copyButton);

    await act(async () => {
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Sample assistant response');
  });

  test('should temporarily render "✓ Copied" text and revert after 1.5 seconds', async () => {
    const mockMessages = [
      { id: 'msg-1', role: 'assistant', content: 'Copy feedback content', streaming: false }
    ];

    render(
      <ChatWindow 
        messages={mockMessages} 
        loading={false} 
        onSend={vi.fn()} 
        sessionId="session-1" 
      />
    );

    const copyButton = screen.getByTitle('Copy response to clipboard');
    
    // Initial state check
    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.queryByText('✓ Copied')).not.toBeInTheDocument();

    // Trigger copy
    fireEvent.click(copyButton);

    await act(async () => {
      await Promise.resolve();
    });

    // Feedback state check
    expect(screen.getByText('✓ Copied')).toBeInTheDocument();

    // Fast-forward timer by 1500ms
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Reverted state check
    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.queryByText('✓ Copied')).not.toBeInTheDocument();
  });
});