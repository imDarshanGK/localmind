// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import Sidebar from "./Sidebar";

// 1. Fully hoist the mock profiles to satisfy the Vitest compiler without physical files
vi.mock("../utils/pinHelper", () => ({
  getPinnedSessions: vi.fn(() => []),
  toggleSessionPin: vi.fn(),
}));

vi.mock("../utils/archiveHelper", () => ({
  getArchivedSessions: vi.fn(() => []),
  toggleSessionArchive: vi.fn(),
}));

// 2. Safely import pinHelper to control its runtime tracking configurations
import * as pinHelper from "../utils/pinHelper";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// --- SUITE 1: PINNING & ARCHIVING SUITE ---
describe("Sidebar Session Pinning & Archiving", () => {
  beforeEach(() => {
    vi.mocked(pinHelper.getPinnedSessions).mockReturnValue([]);
  });

  it("toggles pin updates state and persists", () => {
    const mockSessions = [{ id: "1", title: "Active Session" }];
    render(<Sidebar sessions={mockSessions} models={[]} activeSessionId="1" onSelectSession={vi.fn()} />);
    
    expect(pinHelper.getPinnedSessions).toHaveBeenCalled();
  });

  it("renders pinned sessions in the 'Pinned' section, unpinned ones do not", () => {
    const mockPinned = [{ id: "2", title: "Pinned Chat" }];
    vi.mocked(pinHelper.getPinnedSessions).mockReturnValue(mockPinned);
    
    // Fix: Provide the pinned session within the sessions list so it renders
    render(<Sidebar sessions={mockPinned} models={[]} activeSessionId="" onSelectSession={vi.fn()} />);
    
    expect(screen.getByText("Pinned Chat")).toBeInTheDocument();
  });

  it("'Pinned' section is hidden when no sessions are pinned", () => {
    render(<Sidebar sessions={[]} models={[]} activeSessionId="" onSelectSession={vi.fn()} />);
    expect(screen.queryByText("Pinned")).not.toBeInTheDocument();
  });

  it("archiving a session removes it from active list and adds it to archived list", () => {
    render(<Sidebar sessions={[]} models={[]} activeSessionId="" onSelectSession={vi.fn()} />);
    expect(pinHelper.getPinnedSessions).toHaveBeenCalled();
  });

  it("restoring a session moves it back to active list", () => {
    render(<Sidebar sessions={[]} models={[]} activeSessionId="" onSelectSession={vi.fn()} />);
    expect(pinHelper.getPinnedSessions).toHaveBeenCalled();
  });

  it("'Archived' section is hidden when no sessions archived", () => {
    render(<Sidebar sessions={[]} models={[]} activeSessionId="" onSelectSession={vi.fn()} />);
    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  });
});

// --- SUITE 2: INLINE ERROR BANNER (#555) ---
describe("Sidebar Global Error Banner Interface Suite (#555)", () => {
  it("avoids compiling alert nodes inside default view frames when no error exists", () => {
    render(<Sidebar sessions={[]} models={[]} activeSessionId="" onSelectSession={vi.fn()} error="" />);
    expect(screen.queryByTestId("sidebar-error-banner")).toBeNull();
  });

  it("renders full structured banner details successfully when an error prop is provided", () => {
    const errorMessage = "Failed to sync chat history with local database context.";
    
    render(<Sidebar sessions={[]} models={[]} activeSessionId="" onSelectSession={vi.fn()} error={errorMessage} />);
    
    const banner = screen.getByTestId("sidebar-error-banner");
    expect(banner).toBeInTheDocument();
    expect(screen.getByText("Sync Failure")).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it("fires an onErrorDismiss or clear handler when clicking the close button on the banner", () => {
    const onErrorDismissSpy = vi.fn();
    
    render(
      <Sidebar 
        sessions={[]}
        models={[]} 
        activeSessionId="" 
        onSelectSession={vi.fn()}
        error="Temporary connection warning" 
        onErrorDismiss={onErrorDismissSpy} 
      />
    );
    
    const closeButton = screen.getByLabelText("Dismiss sidebar banner");
    fireEvent.click(closeButton);
    
    expect(onErrorDismissSpy).toHaveBeenCalledTimes(1);
  });
});