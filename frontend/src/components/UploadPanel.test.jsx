// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, test, expect, afterEach } from "vitest";
import UploadPanel from "./UploadPanel";

afterEach(() => {
  cleanup();
});

describe("UploadPanel Accessibility Landmarks Suite (#569)", () => {
  test("contains accessible section landmarks and titles", () => {
    render(<UploadPanel sessionId="session-123" documents={[]} onUploaded={() => {}} onClose={() => {}} />);
    
    // Verifies the presence of a section container that is properly labeled by a header item
    const panelSection = screen.getByRole("region", { name: /documents/i });
    expect(panelSection).toBeDefined();
  });

  test("includes a live region wrapper with role status for operational reports", () => {
    render(<UploadPanel sessionId="session-123" documents={[]} onUploaded={() => {}} onClose={() => {}} />);
    
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toBeDefined();
  });
});