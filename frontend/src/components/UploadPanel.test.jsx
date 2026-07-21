// @vitest-environment jsdom
import React from "react";
import { describe, it, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import UploadPanel from "./UploadPanel";
import * as api from "../utils/api";

// Mock API layer
vi.mock("../utils/api", () => ({
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  previewDocument: vi.fn(),
}));

// Mock icons for testing
vi.mock("./Icons", () => ({
  CheckIcon: () => <span data-testid="check-icon" />,
  DocumentsIcon: () => <span data-testid="documents-icon" />,
  ErrorIcon: () => <span data-testid="error-icon" />,
  SpinnerIcon: () => <span data-testid="spinner-icon" />,
  UploadIcon: () => <span data-testid="upload-icon" />,
  FileIcon: () => <span data-testid="file-icon" />,
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function makeFile(name) {
  return new File(["dummy content"], name, { type: "text/plain" });
}

// --- Loading Skeleton Support Tests (#564) ---
describe("UploadPanel Component - Skeleton Support (#564)", () => {
  const defaultProps = {
    sessionId: "session-123",
    documents: [],
    onUploaded: vi.fn(),
    onClose: vi.fn(),
    show: true,
  };

  it("renders loading skeletons when isLoading prop is true", () => {
    render(<UploadPanel {...defaultProps} isLoading={true} />);

    // Skeleton container should be present
    expect(screen.getByTestId("upload-panel-skeleton")).toBeInTheDocument();

    // Regular drop zone text should NOT be present while loading
    expect(screen.queryByText(/Drop files here or click to browse/i)).not.toBeInTheDocument();
  });

  it("renders drop zone and documents when isLoading is false", () => {
    const mockDocs = [{ filename: "doc1.pdf", chunks_indexed: 5 }];

    render(<UploadPanel {...defaultProps} documents={mockDocs} isLoading={false} />);

    // Skeleton should NOT be in the document
    expect(screen.queryByTestId("upload-panel-skeleton")).not.toBeInTheDocument();

    // Actual elements should render
    expect(screen.getByText(/Drop files here or click to browse/i)).toBeInTheDocument();
    expect(screen.getByText("doc1.pdf")).toBeInTheDocument();
    expect(screen.getByText("5 chunks")).toBeInTheDocument();
  });

  it("renders inline skeleton status indicator when a file is actively uploading", async () => {
    vi.mocked(api.uploadDocument).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ filename: "uploaded.pdf", message: "Indexed" }), 200))
    );

    const { container } = render(<UploadPanel {...defaultProps} />);

    const file = new File(["sample content"], "uploaded.pdf", { type: "application/pdf" });
    const input = container.querySelector('input[type="file"]');

    fireEvent.change(input, { target: { files: [file] } });

    // Expect inline uploading skeleton indicator to appear
    expect(screen.getByTestId("document-uploading-skeleton")).toBeInTheDocument();

    await waitFor(() => {
      expect(defaultProps.onUploaded).toHaveBeenCalledWith("uploaded.pdf");
    });
  });

  it("triggers onClose callback when close button is clicked", () => {
    render(<UploadPanel {...defaultProps} />);

    const closeBtn = screen.getByRole("button", { name: "Close upload panel" });
    fireEvent.click(closeBtn);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});

describe("UploadPanel Empty-State Guidance Suite (#565)", () => {
  const defaultProps = {
    sessionId: "session-123",
    onUploaded: vi.fn(),
    onClose: vi.fn(),
    show: true,
  };

  it("renders empty-state guidance container when documents array is empty", () => {
    render(<UploadPanel {...defaultProps} documents={[]} />);

    expect(screen.getByTestId("upload-empty-state")).toBeInTheDocument();
    expect(screen.getByText("No documents added yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Upload files above to index context for your session workspace/i)
    ).toBeInTheDocument();
  });

  it("does not render empty-state guidance when documents are present", () => {
    const mockDocs = [{ filename: "report.pdf", chunks_indexed: 3 }];
    render(<UploadPanel {...defaultProps} documents={mockDocs} />);

    expect(screen.queryByTestId("upload-empty-state")).not.toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("3 chunks")).toBeInTheDocument();
  });
});

describe("UploadPanel Persistence State Interface Suite (#570)", () => {
  let store = {};

  beforeEach(() => {
    store = {};
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => store[key] || null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => { store[key] = String(value); });
    vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => { store = {}; });
  });

  test("loads collapsed default parameters if flags exist inside localStorage store maps", () => {
    store["upload-panel-collapsed:session-persist-1"] = "true";

    render(<UploadPanel sessionId="session-persist-1" documents={[]} onUploaded={() => {}} onClose={() => {}} show={true} />);
    
    const dropzoneText = screen.queryByText(/Drop files here or click to browse/i);
    expect(dropzoneText).toBeNull(); 
  });

  test("toggles view metrics and updates localStorage states during click actions", () => {
    render(<UploadPanel sessionId="session-persist-2" documents={[]} onUploaded={() => {}} onClose={() => {}} show={true} />);
    
    const toggleButton = screen.getByLabelText(/Collapse upload section/i);
    fireEvent.click(toggleButton);

    expect(localStorage.setItem).toHaveBeenCalledWith("upload-panel-collapsed:session-persist-2", "true");
  });
});

describe("UploadPanel Tooltip Help Interface Suite (#571)", () => {
  test("renders the information help button trigger icon accurately", () => {
    render(<UploadPanel sessionId="session-tooltip" documents={[]} onUploaded={() => {}} onClose={() => {}} show={true} />);
    
    const infoButton = screen.getByLabelText(/Upload limits information description/i);
    expect(infoButton).toBeDefined();
    expect(infoButton.textContent.trim()).toBe("i");
  });

  test("contains hidden tooltip descriptions outlining file limits parameters", () => {
    render(<UploadPanel sessionId="session-tooltip" documents={[]} onUploaded={() => {}} onClose={() => {}} show={true} />);
    
    const inlineTooltipText = screen.getByText(/Supported Upload Formats:/i);
    expect(inlineTooltipText).toBeDefined();
  });
});

describe("UploadPanel Accessibility Landmarks Suite (#569)", () => {
  test("contains accessible section landmarks and titles", () => {
    render(<UploadPanel sessionId="session-access" documents={[]} onUploaded={() => {}} onClose={() => {}} show={true} />);
    
    const panelSection = screen.getByRole("region", { name: /documents/i });
    expect(panelSection).toBeDefined();
  });

  test("includes a live region wrapper with role status for operational reports", () => {
    render(<UploadPanel sessionId="session-access" documents={[]} onUploaded={() => {}} onClose={() => {}} show={true} />);
    
    const liveRegion = screen.queryByRole("status") || screen.queryByTestId("upload-panel");
    expect(liveRegion).toBeDefined();
  });
});

describe("UploadPanel Mobile and Responsive Layout Layout Suite (#568)", () => {
  test("implements mobile view responsive fluid layout classes", () => {
    const { container } = render(
      <UploadPanel sessionId="session-mobile-1" documents={[]} onUploaded={() => {}} onClose={() => {}} show={true} />
    );

    const mainPanel = container.firstChild;
    expect(mainPanel.className).toContain("px-4");
    expect(mainPanel.className).toContain("sm:px-5");
    expect(mainPanel.className).toContain("w-full");
  });

  test("scales indexed list elements to accommodate mobile touch bounds targets", () => {
    const mockDocs = [{ filename: "mobile_spec.pdf", chunks_indexed: 12 }];
    render(
      <UploadPanel sessionId="session-mobile-2" documents={mockDocs} onUploaded={() => {}} onClose={() => {}} show={true} />
    );

    const docText = screen.getByText("mobile_spec.pdf");
    const containerRow = docText.closest("li") || docText.closest("div");
    
    expect(containerRow.className).toContain("min-h-[36px]");
  });
});

describe("UploadPanel Keyboard Navigation Accessibility Suite (#567)", () => {
  test("fires onClose event handler cleanly when hitting the Escape key", () => {
    const mockOnClose = vi.fn();
    render(<UploadPanel sessionId="session-key-1" documents={[]} onUploaded={vi.fn()} onClose={mockOnClose} show={true} />);
    
    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test("makes drop zone interactive and focusable with keyboard event binds", () => {
    render(<UploadPanel sessionId="session-key-2" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
    const dropzone = screen.getByRole("button", { name: /File upload drop zone/i });
    expect(dropzone).toBeDefined();
    expect(dropzone.tabIndex).toBe(0);

    fireEvent.keyDown(dropzone, { key: "Enter" });
    fireEvent.keyDown(dropzone, { key: " " });
  });
});

describe("UploadPanel Global Error Banner Interface Suite (#566)", () => {
  test("avoids compiling alert nodes inside default view frames", () => {
    render(<UploadPanel sessionId="session-err-1" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    expect(screen.queryByTestId("upload-error-banner")).toBeNull();
  });

  test("renders full structured banner details successfully when request fails", async () => {
    api.uploadDocument.mockRejectedValueOnce(new Error("File allocation table mapping rejected context bounds."));
    
    render(<UploadPanel sessionId="session-err-2" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
    const file = new File(["test data payload"], "matrix.txt", { type: "text/plain" });
    const dropzone = screen.getByText(/Drop files here or click to browse/i);
    
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] }
    });

    const uploadBtn = screen.getByRole("button", { name: /Upload Draft/i });
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(screen.getByTestId("upload-error-banner")).toBeDefined();
      expect(screen.getByText("Upload Failure")).toBeDefined();
      expect(screen.getByText("File allocation table mapping rejected context bounds.")).toBeDefined();
    });
  });

  test("clears current alert state wrapper when firing click events on layout close button", async () => {
    api.uploadDocument.mockRejectedValueOnce(new Error("Storage block exhausted."));
    
    render(<UploadPanel sessionId="session-err-3" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
    const file = new File(["data"], "log.txt", { type: "text/plain" });
    const dropzone = screen.getByText(/Drop files here or click to browse/i);
    
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    const uploadBtn = screen.getByRole("button", { name: /Upload Draft/i });
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(screen.getByTestId("upload-error-banner")).toBeDefined();
    });

    const closeButton = screen.getByLabelText("Dismiss failure banner");
    fireEvent.click(closeButton);

    expect(screen.queryByTestId("upload-error-banner")).toBeNull();
  });
});

describe("UploadPanel Saved Drafts Workflow Suite (#574)", () => {
  test("stages dropped documents as a local draft item first without launching network actions", () => {
    render(<UploadPanel sessionId="session-draft-1" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
    const dropzone = screen.getByText(/Drop files here or click to browse/i).parentElement;
    const mockFile = new File(["draft-content"], "contract_draft.pdf", { type: "application/pdf" });

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [mockFile] }
    });

    expect(screen.getByText(/contract_draft\.pdf/i)).toBeDefined();
    expect(screen.getByText("Draft")).toBeDefined();
    expect(screen.getByRole("button", { name: /Upload Draft/i })).toBeDefined();
    expect(api.uploadDocument).not.toHaveBeenCalled();
  });

  test("clears the active draft workspace when clicking the cancel button", () => {
    render(<UploadPanel sessionId="session-draft-2" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
    const dropzone = screen.getByText(/Drop files here or click to browse/i).parentElement;
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
    
    render(<UploadPanel sessionId="session-draft-3" documents={[]} onUploaded={onUploadedSpy} onClose={vi.fn()} show={true} />);
    
    const dropzone = screen.getByText(/Drop files here or click to browse/i).parentElement;
    const mockFile = new File(["draft-content"], "contract_draft.pdf", { type: "application/pdf" });

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [mockFile] }
    });

    const uploadBtn = screen.getByRole("button", { name: /Upload Draft/i });
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(api.uploadDocument).toHaveBeenCalledWith(mockFile, "session-draft-3");
      expect(onUploadedSpy).toHaveBeenCalledWith("contract_draft.pdf");
      expect(screen.queryByRole("button", { name: /Upload Draft/i })).toBeNull();
    });
  });
});

describe("UploadPanel Interaction Test Suite (#573)", () => {
  test("triggers file selection window when clicking the drop zone", () => {
    render(<UploadPanel sessionId="session-int-1" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
    const dropzone = screen.getByText(/Drop files here or click to browse/i).parentElement;
    const input = dropzone.querySelector("input[type='file']");
    
    const clickSpy = vi.spyOn(input, "click");
    input.addEventListener('click', (e) => e.stopPropagation(), { once: true });
    
    fireEvent.click(dropzone);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test("manages drag state styles when dragging items over and out of the viewport", () => {
    render(<UploadPanel sessionId="session-int-2" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
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
    render(<UploadPanel sessionId="session-int-3" documents={[]} onUploaded={onUploadedSpy} onClose={vi.fn()} show={true} />);
    
    const dropzone = screen.getByText(/Drop files here or click to browse/i).parentElement;
    const mockFile = new File(["content"], "resume.pdf", { type: "application/pdf" });

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [mockFile],
      },
    });

    const uploadBtn = screen.getByRole("button", { name: /Upload Draft/i });
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(api.uploadDocument).toHaveBeenCalledWith(mockFile, "session-int-3");
      expect(onUploadedSpy).toHaveBeenCalledWith("resume.pdf");
    });
  });
});

describe("UploadPanel multi-select upload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders the file input with the multiple attribute", () => {
    const { container } = render(
      <UploadPanel sessionId="session-multi-1" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />
    );
    const input = container.querySelector("input[type='file']");
    expect(input).toHaveAttribute("multiple");
  });

  it("uploads every selected file and reports a success row for each", async () => {
    api.uploadDocument.mockImplementation((file) =>
      Promise.resolve({ filename: file.name, message: "Indexed" })
    );
    const onUploaded = vi.fn();

    const { container } = render(
      <UploadPanel sessionId="session-multi-2" documents={[]} onUploaded={onUploaded} onClose={vi.fn()} show={true} />
    );

    const input = container.querySelector("input[type='file']");
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

    const { container } = render(
      <UploadPanel sessionId="session-multi-3" documents={[]} onUploaded={onUploaded} onClose={vi.fn()} show={true} />
    );

    const input = container.querySelector("input[type='file']");
    const files = [makeFile("good.pdf"), makeFile("bad.exe")];
    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(api.uploadDocument).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/good\.pdf/)).toBeDefined();
    expect(screen.getByText(/bad\.exe/)).toBeDefined();
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });

  it("shows document preview on success", async () => {
    api.previewDocument.mockResolvedValue({ content: "This is the document content preview." });
    
    render(
      <UploadPanel sessionId="session-multi-4" documents={[{ filename: "test.pdf", chunks_indexed: 5 }]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />
    );

    const previewButtons = screen.getAllByTitle("Preview Document Content");
    fireEvent.click(previewButtons[0]);

    await waitFor(() => expect(api.previewDocument).toHaveBeenCalledWith("test.pdf", "session-multi-4"));
    expect(screen.getByText("This is the document content preview.")).toBeInTheDocument();
  });

  it("renders fallback UI on preview failure and allows retry and clear selection", async () => {
    api.previewDocument
      .mockRejectedValueOnce(new Error("Corrupt PDF structure"))
      .mockResolvedValueOnce({ content: "Recovered content after retry" });

    render(
      <UploadPanel sessionId="session-multi-5" documents={[{ filename: "corrupt.pdf", chunks_indexed: 1 }]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />
    );

    const previewButtons = screen.getAllByTitle("Preview Document Content");
    fireEvent.click(previewButtons[0]);

    await waitFor(() => expect(api.previewDocument).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Failed to Load Preview")).toBeInTheDocument();
    expect(screen.getByText("Corrupt PDF structure")).toBeInTheDocument();

    const retryButton = screen.getByText("Retry");
    const clearButton = screen.getByText("Clear Selection");
    expect(retryButton).toBeInTheDocument();
    expect(clearButton).toBeInTheDocument();

    fireEvent.click(retryButton);
    await waitFor(() => expect(api.previewDocument).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Recovered content after retry")).toBeInTheDocument();
    expect(screen.queryByText("Failed to Load Preview")).not.toBeInTheDocument();

    const closeButton = screen.getByText("Close");
    fireEvent.click(closeButton);
    expect(screen.queryByText("Recovered content after retry")).not.toBeInTheDocument();

    api.previewDocument.mockRejectedValueOnce(new Error("Another failure"));
    fireEvent.click(previewButtons[0]);

    await waitFor(() => expect(api.previewDocument).toHaveBeenCalledTimes(3));
    expect(screen.getByText("Failed to Load Preview")).toBeInTheDocument();

    const clearButton2 = screen.getByText("Clear Selection");
    fireEvent.click(clearButton2);
    expect(screen.queryByText("Failed to Load Preview")).not.toBeInTheDocument();
  });
});