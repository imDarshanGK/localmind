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

describe("UploadPanel Persistence State Interface Suite (#570)", () => {
  let store = {};

  beforeEach(() => {
    store = {};
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => store[key] || null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => { store[key] = String(value); });
    vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => { store = {}; });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("loads collapsed default parameters if flags exist inside localStorage store maps", () => {
    store["upload-panel-collapsed:session-abc"] = "true";

    render(<UploadPanel sessionId="session-abc" documents={[]} onUploaded={() => {}} onClose={() => {}} show={true} />);
    
    const dropzoneText = screen.queryByText(/Drop files here or click to browse/i);
    expect(dropzoneText).toBeNull(); 
  });

  test("toggles view metrics and updates localStorage states during click actions", () => {
    render(<UploadPanel sessionId="session-abc" documents={[]} onUploaded={() => {}} onClose={() => {}} show={true} />);
    
    const toggleButton = screen.getByLabelText(/Collapse upload section/i);
    fireEvent.click(toggleButton);

    expect(localStorage.setItem).toHaveBeenCalledWith("upload-panel-collapsed:session-abc", "true");
  });
});

describe("UploadPanel Mobile and Responsive Layout Layout Suite (#568)", () => {
  test("implements mobile view responsive fluid layout classes", () => {
    const { container } = render(
      <UploadPanel sessionId="session-123" documents={[]} onUploaded={() => {}} onClose={() => {}} show={true} />
    );

    const mainPanel = container.firstChild;
    expect(mainPanel.className).toContain("px-4");
    expect(mainPanel.className).toContain("sm:px-5");
    expect(mainPanel.className).toContain("w-full");
  });

  test("scales indexed list elements to accommodate mobile touch bounds targets", () => {
    const mockDocs = [{ filename: "mobile_spec.pdf", chunks_indexed: 12 }];
    render(
      <UploadPanel sessionId="session-123" documents={mockDocs} onUploaded={() => {}} onClose={() => {}} show={true} />
    );

    const docText = screen.getByText("mobile_spec.pdf");
    const containerRow = docText.closest("div");
    
    expect(containerRow.className).toContain("min-h-[36px]");
  });
});

describe("UploadPanel Keyboard Navigation Accessibility Suite (#567)", () => {
  test("fires onClose event handler cleanly when hitting the Escape key", () => {
    const mockOnClose = vi.fn();
    render(<UploadPanel sessionId="test-session" documents={[]} onUploaded={vi.fn()} onClose={mockOnClose} show={true} />);
    
    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test("makes drop zone interactive and focusable with keyboard event binds", () => {
    render(<UploadPanel sessionId="test-session" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
    const dropzone = screen.getByRole("button", { name: /File upload drop zone/i });
    expect(dropzone).toBeDefined();
    expect(dropzone.tabIndex).toBe(0);

    // Verify key triggers do not crash execution boundaries
    fireEvent.keyDown(dropzone, { key: "Enter" });
    fireEvent.keyDown(dropzone, { key: " " });
  });
});

describe("UploadPanel Global Error Banner Interface Suite (#566)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("avoids compiling alert nodes inside default view frames", () => {
    render(<UploadPanel sessionId="session-123" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    expect(screen.queryByTestId("upload-error-banner")).toBeNull();
  });

  test("renders full structured banner details successfully when request fails", async () => {
    api.uploadDocument.mockRejectedValueOnce(new Error("File allocation table mapping rejected context bounds."));
    
    render(<UploadPanel sessionId="session-123" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
    const file = new File(["test data payload"], "matrix.txt", { type: "text/plain" });
    const dropzone = screen.getByText(/Drop files here or click to browse/i);
    
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