// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import UploadPanel from "./UploadPanel";
import * as api from "../utils/api";

// Mock the API layer
vi.mock("../utils/api", () => ({
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));

// Mock icons for clean testing
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
  vi.clearAllMocks();
});

describe("UploadPanel Component - Skeleton Support (#564)", () => {
  const defaultProps = {
    sessionId: "session-123",
    documents: [],
    onUploaded: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders loading skeletons when isLoading prop is true", () => {
    render(<UploadPanel {...defaultProps} isLoading={true} />);

    // Skeleton container should be present
    expect(screen.getByTestId("upload-panel-skeleton")).toBeInTheDocument();

    // Regular drop zone text should NOT be present while loading
    expect(screen.queryByText(/Drop file here or click to browse/i)).not.toBeInTheDocument();
  });

  it("renders drop zone and documents when isLoading is false", () => {
    const mockDocs = [{ filename: "doc1.pdf", chunks_indexed: 5 }];

    render(<UploadPanel {...defaultProps} documents={mockDocs} isLoading={false} />);

    // Skeleton should NOT be in the document
    expect(screen.queryByTestId("upload-panel-skeleton")).not.toBeInTheDocument();

    // Actual elements should render
    expect(screen.getByText(/Drop file here or click to browse/i)).toBeInTheDocument();
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

    const closeBtn = screen.getByRole("button", { name: "×" });
    fireEvent.click(closeBtn);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});