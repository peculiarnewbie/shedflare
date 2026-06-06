// @vitest-environment jsdom
import { describe, expect, test } from "vite-plus/test";
import { render } from "@solidjs/testing-library";
import ToastContainer from "./ToastContainer";
import { TestDriveProvider } from "../test/test-context";

describe("ToastContainer", () => {
  test("renders nothing when no toasts", () => {
    const { container } = render(() => (
      <TestDriveProvider>
        <ToastContainer />
      </TestDriveProvider>
    ));
    expect(container.querySelector(".toast-container")).toBeNull();
  });

  test("renders toasts from context", () => {
    const { container, getByText } = render(() => (
      <TestDriveProvider
        value={{
          toasts: () => [
            { id: "1", message: "File uploaded", type: "success" },
            { id: "2", message: "Error occurred", type: "error" },
          ],
        }}
      >
        <ToastContainer />
      </TestDriveProvider>
    ));
    expect(getByText("File uploaded")).toBeTruthy();
    expect(getByText("Error occurred")).toBeTruthy();
    const toastEls = container.querySelectorAll(".toast");
    expect(toastEls).toHaveLength(2);
  });

  test("applies type-specific class", () => {
    const { container } = render(() => (
      <TestDriveProvider
        value={{
          toasts: () => [{ id: "1", message: "Success!", type: "success" }],
        }}
      >
        <ToastContainer />
      </TestDriveProvider>
    ));
    const toast = container.querySelector(".toast");
    expect(toast?.classList.contains("toast-success")).toBe(true);
  });
});
