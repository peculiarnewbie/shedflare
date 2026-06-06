// @vitest-environment jsdom
import { describe, expect, test } from "vite-plus/test";
import { render, fireEvent } from "@solidjs/testing-library";
import FileCard from "./FileCard";
import { TestDriveProvider } from "../test/test-context";
import type { DriveFile } from "../types";

const baseFile: DriveFile = {
  id: "file-1",
  name: "document.pdf",
  mimeType: "application/pdf",
  size: 2048,
  description: "A test document",
  isPublic: false,
  createdAt: "2026-01-15T10:30:00Z",
  updatedAt: "2026-01-15T10:30:00Z",
  tags: ["work", "important"],
};

describe("FileCard", () => {
  test("renders file name", () => {
    const { getByText } = render(() => (
      <TestDriveProvider>
        <FileCard file={baseFile} />
      </TestDriveProvider>
    ));
    expect(getByText("document.pdf")).toBeTruthy();
  });

  test("renders file description", () => {
    const { getByText } = render(() => (
      <TestDriveProvider>
        <FileCard file={baseFile} />
      </TestDriveProvider>
    ));
    expect(getByText("A test document")).toBeTruthy();
  });

  test("renders mime type when no description", () => {
    const file = { ...baseFile, description: "" };
    const { getByText } = render(() => (
      <TestDriveProvider>
        <FileCard file={file} />
      </TestDriveProvider>
    ));
    expect(getByText("application/pdf")).toBeTruthy();
  });

  test("renders formatted size", () => {
    const { getByText } = render(() => (
      <TestDriveProvider>
        <FileCard file={baseFile} />
      </TestDriveProvider>
    ));
    expect(getByText("2 KB")).toBeTruthy();
  });

  test("renders tags", () => {
    const { getByText } = render(() => (
      <TestDriveProvider>
        <FileCard file={baseFile} />
      </TestDriveProvider>
    ));
    expect(getByText("work")).toBeTruthy();
    expect(getByText("important")).toBeTruthy();
  });

  test("renders file glyph for non-previewable files", () => {
    const { container } = render(() => (
      <TestDriveProvider>
        <FileCard file={baseFile} />
      </TestDriveProvider>
    ));
    const glyph = container.querySelector(".file-mark");
    expect(glyph).toBeTruthy();
    expect(glyph?.textContent).toBe("PDF");
  });

  test("renders preview image for image files", () => {
    const imageFile: DriveFile = { ...baseFile, mimeType: "image/png" };
    const { container } = render(() => (
      <TestDriveProvider>
        <FileCard file={imageFile} />
      </TestDriveProvider>
    ));
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.src).toContain(`/api/files/${imageFile.id}/preview`);
  });

  test("renders public badge when file is public", () => {
    const publicFile: DriveFile = { ...baseFile, isPublic: true };
    const { getByText } = render(() => (
      <TestDriveProvider>
        <FileCard file={publicFile} />
      </TestDriveProvider>
    ));
    expect(getByText("Public")).toBeTruthy();
  });

  test("does not render public badge when file is not public", () => {
    const { container } = render(() => (
      <TestDriveProvider>
        <FileCard file={baseFile} />
      </TestDriveProvider>
    ));
    expect(container.querySelector(".card-public-badge")).toBeNull();
  });

  test("clicking card sets selected file", () => {
    let selectedId = "";
    const { container } = render(() => (
      <TestDriveProvider
        value={{
          setSelectedFileId: (id: string) => {
            selectedId = id;
          },
          setRightSidebarCollapsed: () => {},
        }}
      >
        <FileCard file={baseFile} />
      </TestDriveProvider>
    ));
    fireEvent.click(container.querySelector("article")!);
    expect(selectedId).toBe("file-1");
  });

  test("checkbox toggles selection", () => {
    let toggledId = "";
    const { container } = render(() => (
      <TestDriveProvider
        value={{
          selection: () => new Set<string>(),
          toggleFileSelection: (id: string) => {
            toggledId = id;
          },
        }}
      >
        <FileCard file={baseFile} />
      </TestDriveProvider>
    ));
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(toggledId).toBe("file-1");
  });
});
