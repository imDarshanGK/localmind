import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

  it("renders a delete button for each document and opens the confirmation modal on click", async () => {
    const documents = [
      { id: 123, filename: "test-doc.pdf", chunks_indexed: 5, status: "completed" }
    ];
    const onUploaded = vi.fn();
    render(
      <UploadPanel sessionId="s1" documents={documents} onUploaded={onUploaded} onClose={vi.fn()} show={true} />
    );

    const deleteBtn = screen.getByTitle("Delete Document");
    expect(deleteBtn).toBeInTheDocument();

    // Click delete button
    fireEvent.click(deleteBtn);

    // Confirmation modal should appear
    expect(screen.getByText(/Are you sure you want to delete 'test-doc.pdf'\?/)).toBeInTheDocument();
    
    // Modal buttons should be present
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    const confirmDeleteBtn = screen.getByRole("button", { name: "Delete" });
    expect(cancelBtn).toBeInTheDocument();
    expect(confirmDeleteBtn).toBeInTheDocument();

    // Click Cancel
    fireEvent.click(cancelBtn);
    expect(screen.queryByText(/Are you sure you want to delete 'test-doc.pdf'\?/)).not.toBeInTheDocument();
    expect(api.deleteDocument).not.toHaveBeenCalled();
  });

  it("deletes the document upon confirmation and shows a toast", async () => {
    api.deleteDocument.mockResolvedValue({ status: "deleted", doc_id: 123 });
    const documents = [
      { id: 123, filename: "test-doc.pdf", chunks_indexed: 5, status: "completed" }
    ];
    const onUploaded = vi.fn();
    render(
      <UploadPanel sessionId="s1" documents={documents} onUploaded={onUploaded} onClose={vi.fn()} show={true} />
    );

    const deleteBtn = screen.getByTitle("Delete Document");
    fireEvent.click(deleteBtn);

    const confirmDeleteBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(api.deleteDocument).toHaveBeenCalledWith(123);
    });

    expect(onUploaded).toHaveBeenCalled();
    expect(screen.getByText("Document deleted successfully.")).toBeInTheDocument();
  });
});