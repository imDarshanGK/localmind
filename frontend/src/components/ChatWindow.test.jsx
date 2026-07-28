// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import ChatWindow from './ChatWindow';

expect.extend(jestDomMatchers);

// Mock dependencies
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

// --- ISSUE #552: SAVED DRAFTS TESTS ---
describe('ChatWindow Saved Drafts (#552)', () => {
  test('restores saved draft from localStorage on initial render', () => {
    localStorage.setItem('localmind_draft_session-1', 'Restored draft content');

    render(
      <ChatWindow
        messages={[]}
        loading={false}
        onSend={vi.fn()}
        sessionId="session-1"
      />
    );

    const textarea = screen.getByPlaceholderText(/Ask anything.../i);
    expect(textarea.value).toBe('Restored draft content');
  });

  test('persists typed input to localStorage in real-time', () => {
    render(
      <ChatWindow
        messages={[]}
        loading={false}
        onSend={vi.fn()}
        sessionId="session-1"
      />
    );

    const textarea = screen.getByPlaceholderText(/Ask anything.../i);
    fireEvent.change(textarea, { target: { value: 'Drafting a new prompt' } });

    expect(localStorage.getItem('localmind_draft_session-1')).toBe(
      'Drafting a new prompt'
    );
  });

  test('clears saved draft from localStorage after sending message', () => {
    const onSendSpy = vi.fn();
    render(
      <ChatWindow
        messages={[]}
        loading={false}
        onSend={onSendSpy}
        sessionId="session-1"
      />
    );

    const textarea = screen.getByPlaceholderText(/Ask anything.../i);
    fireEvent.change(textarea, { target: { value: 'Ready to submit' } });

    const sendButton = screen.getByRole('button', { name: /Send/i });
    fireEvent.click(sendButton);

    expect(onSendSpy).toHaveBeenCalledWith('Ready to submit');
    expect(localStorage.getItem('localmind_draft_session-1')).toBeNull();
  });

  test('switches draft content dynamically when sessionId changes', () => {
    localStorage.setItem('localmind_draft_session-A', 'Draft for Session A');
    localStorage.setItem('localmind_draft_session-B', 'Draft for Session B');

    const { rerender } = render(
      <ChatWindow
        messages={[]}
        loading={false}
        onSend={vi.fn()}
        sessionId="session-A"
      />
    );

    const textarea = screen.getByPlaceholderText(/Ask anything.../i);
    expect(textarea.value).toBe('Draft for Session A');

    rerender(
      <ChatWindow
        messages={[]}
        loading={false}
        onSend={vi.fn()}
        sessionId="session-B"
      />
    );

    expect(textarea.value).toBe('Draft for Session B');
  });
});