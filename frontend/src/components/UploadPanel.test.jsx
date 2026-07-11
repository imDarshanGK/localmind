// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, test, expect, vi, afterEach } from "vitest";
import UploadPanel from "./UploadPanel";

afterEach(() => {
  cleanup();
});

describe("UploadPanel Keyboard Navigation Accessibility Suite (#567)", () => {
  test("fires onClose event handler cleanly when hitting the Escape key", () => {
    const mockOnClose = vi.fn();
    render(<UploadPanel sessionId="test-session" documents={[]} onUploaded={vi.fn()} onClose={mockOnClose} />);
    
    // FIXED (#567): Updated casing from keydown to keyDown
    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test("makes drop zone interactive and focusable with keyboard event binds", () => {
    render(<UploadPanel sessionId="test-session" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} />);
    
    const dropzone = screen.getByRole("button", { name: /File upload drop zone/i });
    expect(dropzone).toBeDefined();
    expect(dropzone.tabIndex).toBe(0);

    // FIXED (#567): Updated casing from keydown to keyDown
    fireEvent.keyDown(dropzone, { key: "Enter" });
    fireEvent.keyDown(dropzone, { key: " " });
  });
});