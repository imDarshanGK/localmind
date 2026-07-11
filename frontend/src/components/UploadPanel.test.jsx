// @vitest-environment jsdom
import { describe, it, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import UploadPanel from "./UploadPanel";
import * as api from "../utils/api";

vi.mock("../utils/api", () => ({
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  previewDocument: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("UploadPanel Keyboard Navigation Accessibility Suite (#567)", () => {
  test("fires onClose event handler cleanly when hitting the Escape key", () => {
    const mockOnClose = vi.fn();
    render(<UploadPanel sessionId="test-session" documents={[]} onUploaded={vi.fn()} onClose={mockOnClose} show={true} />);
    
    // FIXED (#567): Using matching standard Vitest keyDown parameters
    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test("makes drop zone interactive and focusable with keyboard event binds", () => {
    render(<UploadPanel sessionId="test-session" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
    const dropzone = screen.getByRole("button", { name: /File upload drop zone/i });
    expect(dropzone).toBeDefined();
    expect(dropzone.tabIndex).toBe(0);

    // FIXED (#567): Using matching standard Vitest keyDown parameters
    fireEvent.keyDown(dropzone, { key: "Enter" });
    fireEvent.keyDown(dropzone, { key: " " });
  });
});

function makeFile(name) {
  return new File(["dummy content"], name, { type: "text/plain" });
}

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
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });
});