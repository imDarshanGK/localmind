// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, test, expect, vi, afterEach } from "vitest";
import SettingsPanel from "./SettingsPanel";

afterEach(() => {
  cleanup();
});

describe("SettingsPanel Empty State Suite (#576)", () => {
  test("renders empty guidance card view when an empty settings object is supplied", () => {
    render(<SettingsPanel settings={{}} onSave={vi.fn()} onClose={vi.fn()} />);
    
    expect(screen.getByText("No Profile Configuration Found")).toBeDefined();
    expect(screen.getByText("Load System Defaults")).toBeDefined();
  });

  test("renders standard parameters layout when data is properly provisioned", () => {
    const validSettings = { default_model: "llama3", default_language: "en" };
    render(<SettingsPanel settings={validSettings} onSave={vi.fn()} onClose={vi.fn()} />);
    
    expect(screen.queryByText("No Profile Configuration Found")).toBeNull();
    expect(screen.getByText("Default Model")).toBeDefined();
  });
});