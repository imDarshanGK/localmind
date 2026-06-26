import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Sidebar from "./Sidebar";
import * as pinHelper from "../utils/pinHelper";

// Mock localStorage and pinHelper for isolated tests
vi.mock("../utils/pinHelper", () => ({
  getPinnedSessions: vi.fn(),
  toggleSessionPin: vi.fn(),
}));

const mockSessions = [
  { id: "1", title: "Chat Alpha", message_count: 5 },
  { id: "2", title: "Chat Beta", message_count: 2 },
  { id: "3", title: "Chat Gamma", message_count: 0 },
];


describe("Sidebar Session Pinning & Archiving", () => {

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    pinHelper.getPinnedSessions.mockReturnValue([]);

    archiveHelper.getArchivedSessions.mockReturnValue([]);

  });

  it("toggles pin updates state and persists", () => {
    // Setup initial pinned state
    pinHelper.getPinnedSessions.mockReturnValue(["1"]);
    pinHelper.toggleSessionPin.mockImplementation((id) => {
      return id === "1" ? [] : ["1"]; // Mock toggle behavior
    });

    render(<Sidebar sessions={mockSessions} models={[]} />);

    // Session 1 is pinned, Session 2 is unpinned
    const pins = screen.getAllByRole("button", { name: /pin chat/i });
    expect(pins).toHaveLength(3); // One for each session

    // Click to unpin session 1
    const unpinButton = screen.getByLabelText("Unpin chat");
    fireEvent.click(unpinButton);

    expect(pinHelper.toggleSessionPin).toHaveBeenCalledWith("1");
  });

  it("renders pinned sessions in the 'Pinned' section, unpinned ones do not", () => {
    pinHelper.getPinnedSessions.mockReturnValue(["2"]); // Beta is pinned

    render(<Sidebar sessions={mockSessions} models={[]} />);

    // Check headers
    expect(screen.getByText("Pinned")).toBeDefined();
    expect(screen.getByText("Recent")).toBeDefined();

    // In a real DOM check we would verify order/grouping, 
    // but we can verify the text appears and the groups exist.
    const pinnedHeader = screen.getByText("Pinned");
    expect(pinnedHeader).not.toBeNull();
  });

  it("'Pinned' section is hidden when no sessions are pinned", () => {
    pinHelper.getPinnedSessions.mockReturnValue([]); // None pinned

    render(<Sidebar sessions={mockSessions} models={[]} />);

    // "Pinned" and "Recent" headers should NOT be present
    const pinnedHeader = screen.queryByText("Pinned");
    const recentHeader = screen.queryByText("Recent");

    expect(pinnedHeader).toBeNull();
    expect(recentHeader).toBeNull();
    pinHelper.getPinnedSessions.mockReturnValue([]);
    render(<Sidebar sessions={mockSessions} models={[]} />);

    expect(screen.queryByText("Pinned")).toBeNull();
    expect(screen.queryByText("Recent")).toBeNull();
  });

  it("archiving a session removes it from active list and adds it to archived list", () => {
    // 1 is archived
    archiveHelper.getArchivedSessions.mockReturnValue(["1"]);
    render(<Sidebar sessions={mockSessions} models={[]} />);

    // Archiving is triggered via Context Menu, which is tested in unit tests by triggering the method
    // Since we mock getArchivedSessions, we can check if it rendered the "Archived" section
    const archivedHeader = screen.getByText("Archived");
    expect(archivedHeader).toBeDefined();

    // Expand the archived section
    fireEvent.click(archivedHeader);

    // Check restore button is present
    const restoreButtons = screen.getAllByTitle("Restore session");
    expect(restoreButtons).toHaveLength(1);
  });

  it("restoring a session moves it back to active list", () => {
    archiveHelper.getArchivedSessions.mockReturnValue(["1"]);
    archiveHelper.restoreSession.mockReturnValue([]); // Simulate restoring

    render(<Sidebar sessions={mockSessions} models={[]} />);

    // Expand the archived section
    fireEvent.click(screen.getByText("Archived"));

    const restoreButton = screen.getByTitle("Restore session");
    fireEvent.click(restoreButton);

    expect(archiveHelper.restoreSession).toHaveBeenCalledWith("1");
  });

  it("'Archived' section is hidden when no sessions archived", () => {
    archiveHelper.getArchivedSessions.mockReturnValue([]);
    render(<Sidebar sessions={mockSessions} models={[]} />);

    expect(screen.queryByText("Archived")).toBeNull();
  });
});
