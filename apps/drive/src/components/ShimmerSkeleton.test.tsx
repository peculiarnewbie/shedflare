// @vitest-environment jsdom
import { describe, expect, test } from "vite-plus/test";
import { render } from "@solidjs/testing-library";
import ShimmerSkeleton from "./ShimmerSkeleton";

describe("ShimmerSkeleton", () => {
  test("renders 6 shimmer cards", () => {
    const { container } = render(() => <ShimmerSkeleton />);
    const cards = container.querySelectorAll(".shimmer-card");
    expect(cards).toHaveLength(6);
  });

  test("each card has preview and text lines", () => {
    const { container } = render(() => <ShimmerSkeleton />);
    const cards = container.querySelectorAll(".shimmer-card");
    for (const card of cards) {
      expect(card.querySelector(".shimmer-preview")).toBeTruthy();
      const lines = card.querySelectorAll(".shimmer-line");
      expect(lines).toHaveLength(3);
    }
  });
});
