// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Sidebar from "./Sidebar";

// Mock the required SVG/Icon subcomponents
vi.mock("./Icons", () => ({
  AppLogoIcon: () => <span data-testid="logo-icon" />,
  ChatIcon: () => <span data-testid="chat-icon" />,
  LockIcon: () => <span data-testid="lock-icon" />,
  StarIcon: () => <span data-testid="star-icon" />,
}));

// Clean up the virtual DOM tree completely after each execution step
afterEach(() => {
  cleanup();
});

describe("Sidebar Component - Mobile Responsive Layout (#557)", () => {
  const mockSessions = [
    { id: "1", title: "Mobile Session A", message_count: 1 },
    { id: "2", title: "Mobile Session B", message_count: 0 },
  ];
  const mockModels = [{ name: "llama3" }];

  let defaultProps;

  beforeEach(() => {
    defaultProps = {
      sessions: mockSessions,
      currentSession: "",
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

  it("toggles the visibility of the mobile sidebar when clicking the hamburger trigger button", () => {
    render(<Sidebar {...defaultProps} />);

    const toggleBtn = screen.getByRole("button", { name: /toggle navigation sidebar/i });
    expect(toggleBtn).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-backdrop")).not.toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.getByTestId("sidebar-backdrop")).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId("sidebar-backdrop")).not.toBeInTheDocument();
  });

  it("dismisses the open side drawer menu when clicking the backdrop overlay dim screen", () => {
    render(<Sidebar {...defaultProps} />);

    const toggleBtn = screen.getByRole("button", { name: /toggle navigation sidebar/i });
    fireEvent.click(toggleBtn);

    const backdrop = screen.getByTestId("sidebar-backdrop");
    expect(backdrop).toBeInTheDocument();

    fireEvent.click(backdrop);
    expect(screen.queryByTestId("sidebar-backdrop")).not.toBeInTheDocument();
  });

  it("auto-closes the mobile sidebar panel drawer when selecting a session row item", () => {
    render(<Sidebar {...defaultProps} />);

    const toggleBtn = screen.getByRole("button", { name: /toggle navigation sidebar/i });
    fireEvent.click(toggleBtn);

    const sessionBtn = screen.getByRole("button", { name: /mobile session a/i });
    fireEvent.click(sessionBtn);

    expect(defaultProps.onLoadSession).toHaveBeenCalledWith("1");
    expect(screen.queryByTestId("sidebar-backdrop")).not.toBeInTheDocument();
  });

  it("auto-closes the mobile sidebar panel drawer when clicking the + New Chat button option", () => {
    render(<Sidebar {...defaultProps} />);

    const toggleBtn = screen.getByRole("button", { name: /toggle navigation sidebar/i });
    fireEvent.click(toggleBtn);

    const newChatBtn = screen.getByRole("button", { name: /\+ new chat/i });
    fireEvent.click(newChatBtn);

    expect(defaultProps.onNewChat).toHaveBeenCalled();
    expect(screen.queryByTestId("sidebar-backdrop")).not.toBeInTheDocument();
  });
});