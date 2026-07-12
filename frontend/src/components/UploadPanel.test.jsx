// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, test, expect, afterEach } from "vitest";
import UploadPanel from "./UploadPanel";

afterEach(() => {
  cleanup();
});

describe("UploadPanel Tooltip Help Interface Suite (#571)", () => {
  test("renders the information help button trigger icon accurately", () => {
    render(<UploadPanel sessionId="session-123" documents={[]} onUploaded={() => {}} onClose={() => {}} />);
    
    const infoButton = screen.getByLabelText(/Upload limits information description/i);
    expect(infoButton).toBeDefined();
    expect(infoButton.textContent).toBe("i");
  });

  test("contains hidden tooltip descriptions outlining file limits parameters", () => {
    render(<UploadPanel sessionId="session-123" documents={[]} onUploaded={() => {}} onClose={() => {}} />);
    
    const inlineTooltipText = screen.getByText(/Supported Upload Formats:/i);
    expect(inlineTooltipText).toBeDefined();
  });
});