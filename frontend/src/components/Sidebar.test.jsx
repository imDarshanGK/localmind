// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Sidebar from "./Sidebar";

// Mock icon rendering targets using standard span nodes to respect HTML element constraints
vi.mock("./Icons", () => ({
  AppLogoIcon: () => <span data-testid="logo-icon" />,
  ChatIcon: () => <span data-testid="chat-icon" />,
  LockIcon: () => <span data-testid="lock-icon" />,
  StarIcon: () => <span data-testid="star-icon" />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Sidebar Component - Interaction Tests (#562)", () => {
  const mockSessions = [
    { id: "1", title: "First Session", message_count: 2 },
    { id: "2", title: "Second Session", message_count: 0 },
  ];
  const mockModels = [{ name: "llama3" }, { name: "mistral" }];

  let defaultProps;

  beforeEach(() => {
    defaultProps = {
      sessions: mockSessions,
      currentSession: "1",
      models: mockModels,
      model: "llama3",
      language: "en",
      onNewChat: vi.fn(),
      onLoadSession: vi.fn(),
      onDeleteSession: vi.fn(),
      onModelChange: vi.fn(),
      onLanguageChange: vi.fn(),
    };
  });

  it("triggers onNewChat when clicking the '+ New Chat' button", () => {
    render(<Sidebar {...defaultProps} />);
    const newChatBtn = screen.getByTestId("new-chat-btn");

    fireEvent.click(newChatBtn);

    expect(defaultProps.onNewChat).toHaveBeenCalledTimes(1);
  });

  it("triggers onModelChange with selected model when model dropdown value changes", () => {
    render(<Sidebar {...defaultProps} />);
    const modelSelect = screen.getByTestId("model-select");

    fireEvent.change(modelSelect, { target: { value: "mistral" } });

    expect(defaultProps.onModelChange).toHaveBeenCalledWith("mistral");
  });

  it("triggers onLanguageChange with selected code when language dropdown value changes", () => {
    render(<Sidebar {...defaultProps} />);
    const languageSelect = screen.getByTestId("language-select");

    fireEvent.change(languageSelect, { target: { value: "hi" } });

    expect(defaultProps.onLanguageChange).toHaveBeenCalledWith("hi");
  });

  it("triggers onLoadSession with session ID when clicking a session row", () => {
    render(<Sidebar {...defaultProps} />);
    const secondSessionBtn = screen.getByTestId("load-session-2");

    fireEvent.click(secondSessionBtn);

    expect(defaultProps.onLoadSession).toHaveBeenCalledWith("2");
  });

  it("triggers onDeleteSession with session ID when clicking the delete button ('×')", () => {
    render(<Sidebar {...defaultProps} />);
    const deleteBtn = screen.getByTestId("delete-session-1");

    fireEvent.click(deleteBtn);

    expect(defaultProps.onDeleteSession).toHaveBeenCalledWith("1");
  });

  it("updates search input value and filters the visible session list dynamically", () => {
    render(<Sidebar {...defaultProps} />);
    const searchInput = screen.getByTestId("search-input");

    expect(screen.getByTestId("session-item-1")).toBeInTheDocument();
    expect(screen.getByTestId("session-item-2")).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "Second" } });

    expect(screen.queryByTestId("session-item-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("session-item-2")).toBeInTheDocument();
  });

  it("displays empty results message when search filter yields zero matches", () => {
    render(<Sidebar {...defaultProps} />);
    const searchInput = screen.getByTestId("search-input");

    fireEvent.change(searchInput, { target: { value: "NonExistentSessionQuery" } });

    expect(screen.getByTestId("empty-message")).toHaveTextContent("No results.");
  });
});