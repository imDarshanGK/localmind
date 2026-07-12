// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import UploadPanel from "./UploadPanel";
import * as api from "../utils/api";

vi.mock("../utils/api", () => ({
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));

describe("UploadPanel Saved Drafts Workflow Suite (#574)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test("stages dropped documents as a local draft item first without launching network actions", () => {
    render(<UploadPanel sessionId="s-456" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} />);
    
    const dropzone = screen.getByText(/Drop file here or click to browse/i).parentElement;
    const mockFile = new File(["draft-content"], "contract_draft.pdf", { type: "application/pdf" });

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [mockFile] }
    });

    // Verify it renders the draft badge and title information block
    expect(screen.getByText(/contract_draft\.pdf/i)).toBeDefined();
    
    // FIXED (#574): Target the specific static text node exactly to bypass the "Upload Draft" action button matches
    expect(screen.getByText("Draft")).toBeDefined();
    expect(screen.getByRole("button", { name: /Upload Draft/i })).toBeDefined();
    
    // Ensure network API execution layer remains uncalled on staging phase
    expect(api.uploadDocument).not.toHaveBeenCalled();
  });

  test("clears the active draft workspace when clicking the cancel button", () => {
    render(<UploadPanel sessionId="s-456" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} />);
    
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
    
    render(<UploadPanel sessionId="s-456" documents={[]} onUploaded={onUploadedSpy} onClose={vi.fn()} />);
    
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