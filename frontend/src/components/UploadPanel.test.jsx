// @vitest-environment jsdom
import { describe, it, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import UploadPanel from "./UploadPanel";
import * as api from "../utils/api";

vi.mock("../utils/api", () => ({
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));

function makeFile(name) {
  return new File(["dummy content"], name, { type: "text/plain" });
}

describe("UploadPanel Interaction Test Suite (#573)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test("triggers file selection window when clicking the drop zone", () => {
    render(<UploadPanel sessionId="s-123" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
    const dropzone = screen.getByText(/Drop files here or click to browse/i).parentElement;
    const input = dropzone.querySelector("input[type='file']");
    
    const clickSpy = vi.spyOn(input, "click");
    
    // Prevent the secondary programmatic click from infinite bubbling loops in testing context
    input.addEventListener('click', (e) => e.stopPropagation(), { once: true });
    
    fireEvent.click(dropzone);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test("manages drag state styles when dragging items over and out of the viewport", () => {
    render(<UploadPanel sessionId="s-123" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
    const textNode = screen.getByText(/Drop files here or click to browse/i);
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
    render(<UploadPanel sessionId="s-123" documents={[]} onUploaded={onUploadedSpy} onClose={vi.fn()} show={true} />);
    
    const dropzone = screen.getByText(/Drop files here or click to browse/i).parentElement;
    const mockFile = new File(["content"], "resume.pdf", { type: "application/pdf" });

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [mockFile],
      },
    });

    expect(screen.getByText(/Indexing documents\.\.\./i)).toBeDefined();

    await waitFor(() => {
      expect(api.uploadDocument).toHaveBeenCalledWith(mockFile, "s-123");
      expect(onUploadedSpy).toHaveBeenCalledWith("resume.pdf");
    });
  });
});

describe("UploadPanel multi-select upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the file input with the multiple attribute", () => {
    render(
      <UploadPanel sessionId="s1" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />
    );
    const input = screen.getByTestId("upload-panel").querySelector("input[type='file']");
    expect(input).toHaveAttribute("multiple");
  });

  it("uploads every selected file and reports a success row for each", async () => {
    api.uploadDocument.mockImplementation((file) =>
      Promise.resolve({ filename: file.name, message: "Indexed" })
    );
    const onUploaded = vi.fn();

    render(
      <UploadPanel sessionId="s1" documents={[]} onUploaded={onUploaded} onClose={vi.fn()} show={true} />
    );

    const input = screen.getByTestId("upload-panel").querySelector("input[type='file']");
    const files = [makeFile("a.pdf"), makeFile("b.txt"), makeFile("c.md")];
    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(api.uploadDocument).toHaveBeenCalledTimes(3));
    expect(screen.getByText("a.pdf")).toBeDefined();
    expect(screen.getByText("b.txt")).toBeDefined();
    expect(screen.getByText("c.md")).toBeDefined();
    expect(onUploaded).toHaveBeenCalledTimes(3);
  });

  it("keeps uploading remaining files when one file fails", async () => {
    api.uploadDocument.mockImplementation((file) => {
      if (file.name === "bad.exe") return Promise.reject(new Error("Unsupported file type"));
      return Promise.resolve({ filename: file.name, message: "Indexed" });
    });
    const onUploaded = vi.fn();

    render(
      <UploadPanel sessionId="s1" documents={[]} onUploaded={onUploaded} onClose={vi.fn()} show={true} />
    );

    const input = screen.getByTestId("upload-panel").querySelector("input[type='file']");
    const files = [makeFile("good.pdf"), makeFile("bad.exe")];
    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(api.uploadDocument).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/good\.pdf/)).toBeDefined();
    expect(screen.getByText(/bad\.exe.*Unsupported file type/)).toBeDefined();
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });
});