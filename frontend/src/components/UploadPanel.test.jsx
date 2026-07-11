// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, test, expect, afterEach } from "vitest";
import UploadPanel from "./UploadPanel";

afterEach(() => {
  cleanup();
});

describe("UploadPanel Mobile and Responsive Layout Layout Suite (#568)", () => {
  test("implements mobile view responsive fluid layout classes", () => {
    const { container } = render(
      <UploadPanel sessionId="session-123" documents={[]} onUploaded={() => {}} onClose={() => {}} />
    );

    const mainPanel = container.firstChild;
    // Asserts mobile responsive class structure patterns
    expect(mainPanel.className).toContain("px-4");
    expect(mainPanel.className).toContain("sm:px-5");
    expect(mainPanel.className).toContain("w-full");
  });

  test("scales indexed list elements to accommodate mobile touch bounds targets", () => {
    const mockDocs = [{ filename: "mobile_spec.pdf", chunks_indexed: 12 }];
    render(
      <UploadPanel sessionId="session-123" documents={mockDocs} onUploaded={() => {}} onClose={() => {}} />
    );

    const docText = screen.getByText("mobile_spec.pdf");
    const containerRow = docText.closest("div");
    
    // Asserts mobile standard minimum height constraints
    expect(containerRow.className).toContain("min-h-[36px]");
  });
});