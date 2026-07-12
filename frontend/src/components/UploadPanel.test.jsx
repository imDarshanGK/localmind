// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import UploadPanel from "./UploadPanel";
import * as api from "../utils/api";

vi.mock("../utils/api", () => ({
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));

describe("UploadPanel Interaction Test Suite (#573)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test("triggers file selection window when clicking the drop zone", () => {
    render(<UploadPanel sessionId="s-123" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} />);
    
    const dropzone = screen.getByText(/Drop file here or click to browse/i).parentElement;
    const input = dropzone.querySelector("input[type='file']");
    
    const clickSpy = vi.spyOn(input, "click");
    
    // Prevent the secondary programmatic click from infinite bubbling loops in testing context
    input.addEventListener('click', (e) => e.stopPropagation(), { once: true });
    
    fireEvent.click(dropzone);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test("manages drag state styles when dragging items over and out of the viewport", () => {
    render(<UploadPanel sessionId="s-123" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} />);
    
    const textNode = screen.getByText(/Drop file here or click to browse/i);
    const dropzone = textNode.parentElement;

    expect(dropzone.className).toContain("border-gray-700");

    fireEvent.dragOver(dropzone);
    expect(dropzone.className).toContain("border-purple-500");
    expect(dropzone.className).toContain("bg-purple-900/20");

    fireEvent.dragLeave(dropzone);
    expect(dropzone.className).toContain("border-gray-700");
    expect(dropzone.className).not.toContain("border-purple-500");
  });

  test("executes upload handler sequence accurately when a valid file is dropped", async () => {
    const mockResponse = { filename: "resume.pdf", message: "Document parsed successfully" };
    api.uploadDocument.mockResolvedValueOnce(mockResponse);
    
    const onUploadedSpy = vi.fn();
    render(<UploadPanel sessionId="s-123" documents={[]} onUploaded={onUploadedSpy} onClose={vi.fn()} />);
    
    const dropzone = screen.getByText(/Drop file here or click to browse/i).parentElement;
    const mockFile = new File(["content"], "resume.pdf", { type: "application/pdf" });

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [mockFile],
      },
    });

    expect(screen.getByText(/Indexing document\.\.\./i)).toBeDefined();

    await waitFor(() => {
      expect(api.uploadDocument).toHaveBeenCalledWith(mockFile, "s-123");
      expect(onUploadedSpy).toHaveBeenCalledWith("resume.pdf");
      expect(screen.getByText(/Document parsed successfully/i)).toBeDefined();
    });
  });
});