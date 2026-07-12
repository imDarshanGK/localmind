// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import UploadPanel from "./UploadPanel";

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
    // Seed our tracking store map cleanly before mounting
    store["upload-panel-collapsed:session-abc"] = "true";

    render(<UploadPanel sessionId="session-abc" documents={[]} onUploaded={() => {}} onClose={() => {}} />);
    
    const dropzoneText = screen.queryByText(/Drop file here or click to browse/i);
    expect(dropzoneText).toBeNull(); 
  });

  test("toggles view metrics and updates localStorage states during click actions", () => {
    render(<UploadPanel sessionId="session-abc" documents={[]} onUploaded={() => {}} onClose={() => {}} />);
    
    const toggleButton = screen.getByLabelText(/Collapse upload section/i);
    fireEvent.click(toggleButton);

    expect(localStorage.setItem).toHaveBeenCalledWith("upload-panel-collapsed:session-abc", "true");
  });
});