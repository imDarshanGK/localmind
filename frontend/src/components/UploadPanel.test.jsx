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

describe("UploadPanel Global Error Banner Interface Suite (#566)", () => {
  test("avoids compiling alert nodes inside default view frames", () => {
    render(<UploadPanel sessionId="session-123" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    expect(screen.queryByTestId("upload-error-banner")).toBeNull();
  });

  test("renders full structured banner details successfully when request fails", async () => {
    api.uploadDocument.mockRejectedValueOnce(new Error("File allocation table mapping rejected context bounds."));
    
    render(<UploadPanel sessionId="session-123" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
    const file = new File(["test data payload"], "matrix.txt", { type: "text/plain" });
    const dropzone = screen.getByText(/Drop files here or click to browse/i);
    
    // Simulate drops by passing standard file attachments
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] }
    });

    await waitFor(() => {
      expect(screen.getByTestId("upload-error-banner")).toBeDefined();
      expect(screen.getByText("Upload Failure")).toBeDefined();
      expect(screen.getByText("File allocation table mapping rejected context bounds.")).toBeDefined();
    });
  });

  test("clears current alert state wrapper when firing click events on layout close button", async () => {
    api.uploadDocument.mockRejectedValueOnce(new Error("Storage block exhausted."));
    
    render(<UploadPanel sessionId="session-123" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
    const file = new File(["data"], "log.txt", { type: "text/plain" });
    const dropzone = screen.getByText(/Drop files here or click to browse/i);
    
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("upload-error-banner")).toBeDefined();
    });

    const closeButton = screen.getByLabelText("Dismiss failure banner");
    fireEvent.click(closeButton);

    expect(screen.queryByTestId("upload-error-banner")).toBeNull();
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
    expect(screen.getByText(/bad\.exe/)).toBeDefined();
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });
});