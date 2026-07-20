// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Sidebar from "./Sidebar";

// Mock icons to prevent rendering issues in jsdom environment
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

describe("Sidebar Component - Tooltip Help Suite (#560)", () => {
  const mockSessions = [
    { id: "1", title: "Project Alpha", message_count: 3 },
    { id: "2", title: "Project Beta", message_count: 0 },
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

  it("attaches descriptive tooltips to main control elements", () => {
    render(<Sidebar {...defaultProps} />);

    // Query New Chat button using its aria-label accessible name
    const newChatBtn = screen.getByRole("button", { name: "Start a new chat session" });
    expect(newChatBtn).toHaveAttribute("title", "Start a new chat session");

    // Model Selector
    const modelSelect = screen.getByRole("combobox", { name: "Select AI Model" });
    expect(modelSelect).toHaveAttribute("title", "Select AI Model for active conversation");

    // Language Selector
    const languageSelect = screen.getByRole("combobox", { name: "Select Interface Language" });
    expect(languageSelect).toHaveAttribute("title", "Change sidebar interface language");

    // Search Input
    const searchInput = screen.getByPlaceholderText("Search chats...");
    expect(searchInput).toHaveAttribute("title", "Filter chat history by title");
  });

  it("attaches dynamic session tooltips to individual chat rows and delete actions", () => {
    render(<Sidebar {...defaultProps} />);

    // Session Switch Button Tooltip (Exact match on button title/content)
    const sessionBtn = screen.getByRole("button", { name: /^Project Alpha\(3\)$/i });
    expect(sessionBtn).toHaveAttribute("title", "Switch to session: Project Alpha");

    // Session Delete Button Tooltip
    const deleteBtn = screen.getByRole("button", { name: "Delete session Project Alpha" });
    expect(deleteBtn).toHaveAttribute("title", 'Delete session "Project Alpha"');
  });

  it("renders privacy statement and repository external link tooltips in footer", () => {
    render(<Sidebar {...defaultProps} />);

    // Privacy Text Tooltip
    const privacyText = screen.getByTitle("Local privacy statement");
    expect(privacyText).toBeInTheDocument();

    // External GitHub Link Tooltip
    const githubLink = screen.getByRole("link", { name: /star on github/i });
    expect(githubLink).toHaveAttribute("title", "Open GitHub Repository in a new tab");
  });
});