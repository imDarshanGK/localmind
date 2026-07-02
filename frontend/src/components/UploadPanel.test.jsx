<<<<<<< HEAD
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, createEvent } from "@testing-library/react";
import UploadPanel from "./UploadPanel";

describe("UploadPanel Safari Drag & Drop Compatibility", () => {
  it("prevents default on dragEnter to support Safari drag and drop", () => {
    // Safari requires preventDefault on dragEnter for the drop event to fire correctly
    render(<UploadPanel sessionId="123" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    
    // The drop zone container
    const dropzone = screen.getByText(/Drop file here/i).closest("div");

    // Create a dragEnter event
    const dragEnterEvent = createEvent.dragEnter(dropzone);
    
    // Dispatch the event
    fireEvent(dropzone, dragEnterEvent);

    // Verify preventDefault was called on the dragEnter event
    expect(dragEnterEvent.defaultPrevented).toBe(true);
  });
  
  it("prevents default on dragOver", () => {
    render(<UploadPanel sessionId="123" documents={[]} onUploaded={vi.fn()} onClose={vi.fn()} show={true} />);
    const dropzone = screen.getByText(/Drop file here/i).closest("div");

    const dragOverEvent = createEvent.dragOver(dropzone);
    fireEvent(dropzone, dragOverEvent);

    expect(dragOverEvent.defaultPrevented).toBe(true);
  });
});
=======
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
});
>>>>>>> upstream/main
