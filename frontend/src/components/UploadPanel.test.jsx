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

describe("UploadPanel Saved Drafts Workflow Suite (#574)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test("stages dropped documents as a local draft item first without launching network actions", () => {
    render(<UploadPanel sessionId="s-456" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
    const dropzone = screen.getByText(/Drop file here or click to browse/i).parentElement;
    const mockFile = new File(["draft-content"], "contract_draft.pdf", { type: "application/pdf" });

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [mockFile] }
    });

    // Verify it renders the draft badge and title information block
    expect(screen.getByText(/contract_draft\.pdf/i)).toBeDefined();
    
    // FIXED (#574): Targets exact string literal text node to avoid 'Upload Draft' button query conflicts
    expect(screen.getByText("Draft")).toBeDefined();
    expect(screen.getByRole("button", { name: /Upload Draft/i })).toBeDefined();
    
    // Ensure network API execution layer remains uncalled on staging phase
    expect(api.uploadDocument).not.toHaveBeenCalled();
  });

  test("clears the active draft workspace when clicking the cancel button", () => {
    render(<UploadPanel sessionId="s-456" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
    const dropzone = screen.getByText(/Drop file here or click to browse/i).parentElement;
    const mockFile = new File(["draft-content"], "contract_draft.pdf", { type: "application/pdf" });

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [mockFile] }
    });

    const cancelBtn = screen.getByTitle(/Cancel draft/i);
    fireEvent.click(cancelBtn);

    expect(screen.queryByText(/contract_draft\.pdf/i)).toBeNull();
  });

  test("submits network upload execution stack when the user hits the commit action button", async () => {
    api.uploadDocument.mockResolvedValueOnce({ filename: "contract_draft.pdf", message: "Draft processed" });
    const onUploadedSpy = vi.fn();
    
    render(<UploadPanel sessionId="s-456" documents={[]} onUploaded={onUploadedSpy} onClose={vi.fn()} show={true} />);
    
    const dropzone = screen.getByText(/Drop file here or click to browse/i).parentElement;
    const mockFile = new File(["draft-content"], "contract_draft.pdf", { type: "application/pdf" });

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [mockFile] }
    });

    const uploadBtn = screen.getByRole("button", { name: /Upload Draft/i });
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(api.uploadDocument).toHaveBeenCalledWith(mockFile, "s-456");
      expect(onUploadedSpy).toHaveBeenCalledWith("contract_draft.pdf");
      expect(screen.queryByRole("button", { name: /Upload Draft/i })).toBeNull();
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