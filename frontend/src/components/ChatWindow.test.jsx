// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import ChatWindow from './ChatWindow';

expect.extend(jestDomMatchers);

// Mock Icon components
vi.mock('./Icons', () => ({
  AppLogoIcon: () => <span data-testid="app-logo" />,
  FileIcon: () => <span data-testid="file-icon" />,
  LockIcon: () => <span data-testid="lock-icon" />,
  ChartIcon: () => <span data-testid="chart-icon" />,
  CloseIcon: () => <span data-testid="close-icon" />,
  CopyIcon: () => <span data-testid="copy-icon" />,
  PlusCircleIcon: () => <span data-testid="plus-icon" />,
  TemplateIcon: () => <span data-testid="template-icon" />,
}));

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// --- ISSUE #551: INTERACTION TESTS ---
describe("ChatWindow Interaction Tests (#551)", () => {
  test("triggers onSend when clicking the Send button with non-empty input", () => {
    const onSendSpy = vi.fn();
    render(
      <ChatWindow
        messages={[]}
        loading={false}
        onSend={onSendSpy}
        sessionId="session-551"
      />
    );

    const textarea = screen.getByPlaceholderText(/Ask anything.../i);
    const sendButton = screen.getByRole("button", { name: /Send/i });

    expect(sendButton).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "Testing interaction #551" } });
    expect(sendButton).not.toBeDisabled();

    fireEvent.click(sendButton);

    expect(onSendSpy).toHaveBeenCalledWith("Testing interaction #551");
    expect(textarea.value).toBe("");
  });

  test("triggers onStop callback when loading and Stop button is clicked", () => {
    const onStopSpy = vi.fn();
    render(
      <ChatWindow
        messages={[]}
        loading={true}
        onSend={vi.fn()}
        onStop={onStopSpy}
        sessionId="session-551"
      />
    );

    const stopButton = screen.getByRole("button", { name: /Stop/i });
    expect(stopButton).toBeInTheDocument();

    fireEvent.click(stopButton);
    expect(onStopSpy).toHaveBeenCalledTimes(1);
  });

  test("filters rendered messages in real time based on search input", () => {
    const mockMessages = [
      { id: "msg-1", role: "user", content: "First query about Python" },
      { id: "msg-2", role: "assistant", content: "Here is Python explanation" },
      { id: "msg-3", role: "user", content: "Unrelated Docker text" }
    ];

    render(
      <ChatWindow
        messages={mockMessages}
        loading={false}
        onSend={vi.fn()}
        sessionId="session-551"
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search messages.../i);

    expect(screen.getByText("First query about Python")).toBeInTheDocument();
    expect(screen.getByText("Unrelated Docker text")).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "Python" } });

    expect(screen.getByText("First query about Python")).toBeInTheDocument();
    expect(screen.queryByText("Unrelated Docker text")).not.toBeInTheDocument();

    const clearBtn = screen.getByRole("button", { name: /Clear search/i });
    fireEvent.click(clearBtn);

    expect(screen.getByText("Unrelated Docker text")).toBeInTheDocument();
  });
});