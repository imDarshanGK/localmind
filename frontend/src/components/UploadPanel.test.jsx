// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import UploadPanel from "./UploadPanel";

// Mock API layer
vi.mock("../utils/api", () => ({
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
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
  vi.clearAllMocks();
});

describe("UploadPanel Empty-State Guidance Suite (#565)", () => {
  const defaultProps = {
    sessionId: "session-123",
    onUploaded: vi.fn(),
    onClose: vi.fn(),
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