// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Sidebar from "./Sidebar";

// Clean up the virtual DOM after each individual test run
afterEach(() => {
  cleanup();
});

describe("Sidebar Component - Accessibility Landmarks (#558)", () => {
  const mockSessions = [
    { id: "1", title: "Accessible Session A", message_count: 2 },
    { id: "2", title: "Accessible Session B", message_count: 0 },
  ];
  const mockModels = [{ name: "llama3" }];

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

  it("should render the root container as a complementary aside landmark", () => {
    render(<Sidebar {...defaultProps} />);
    
    const asideLandmark = screen.getByRole("complementary", { name: /chat management sidebar/i });
    expect(asideLandmark).toBeInTheDocument();
    expect(asideLandmark.tagName.toLowerCase()).toBe("aside");
  });

  it("should contain a dedicated search landmark region", () => {
    render(<Sidebar {...defaultProps} />);
    
    const searchLandmark = screen.getByRole("search");
    expect(searchLandmark).toBeInTheDocument();
    
    const searchInput = screen.getByLabelText(/search chat sessions history/i);
    expect(searchLandmark).toContainElement(searchInput);
  });

  it("should wrap the session stream within a semantic navigation landmark", () => {
    render(<Sidebar {...defaultProps} />);
    
    const navLandmark = screen.getByRole("navigation", { name: /chat sessions history/i });
    expect(navLandmark).toBeInTheDocument();
    expect(navLandmark.tagName.toLowerCase()).toBe("nav");
  });

  it("should expose aria-current targets reflecting the active dynamic session focus context", () => {
    render(<Sidebar {...defaultProps} />);
    
    // Target the specific chat navigation button using a custom matcher function or precise substring
    const activeBtn = screen.getByRole("button", { name: (content) => content.includes("Accessible Session A") && !content.includes("Delete") });
    const inactiveBtn = screen.getByRole("button", { name: "Accessible Session B" });
    
    expect(activeBtn).toHaveAttribute("aria-current", "true");
    expect(inactiveBtn).not.toHaveAttribute("aria-current");
  });

  it("should isolate structural details inside a semantic footer region", () => {
    render(<Sidebar {...defaultProps} />);
    
    const footerElement = screen.getByRole("contentinfo");
    expect(footerElement).toBeInTheDocument();
    expect(footerElement.tagName.toLowerCase()).toBe("footer");
  });
});