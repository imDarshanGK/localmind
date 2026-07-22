// @vitest-environment jsdom
import React from "react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ChatWindow from "./ChatWindow";

// Mock Icons and API
vi.mock("../utils/api", () => ({
  exportSession: vi.fn(),
}));

vi.mock("./Icons", () => ({
  AppLogoIcon: () => <span data-testid="app-logo" />,
  FileIcon: () => <span data-testid="file-icon" />,
  LockIcon: () => <span data-testid="lock-icon" />,
}));

describe("ChatWindow Skeleton Loading Tests (#542)", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  test("renders loading skeleton when loading is true and no message is streaming", () => {
    render(<ChatWindow messages={[]} loading={true} onSend={vi.fn()} sessionId="test-1" />);

    expect(screen.getByTestId("message-skeleton")).toBeInTheDocument();
  });

  test("does not render skeleton when loading is false", () => {
    render(<ChatWindow messages={[]} loading={false} onSend={vi.fn()} sessionId="test-1" />);

    expect(screen.queryByTestId("message-skeleton")).not.toBeInTheDocument();
  });
});