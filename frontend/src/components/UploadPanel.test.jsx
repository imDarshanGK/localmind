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
