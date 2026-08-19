// @vitest-environment jsdom
import { describe, expect, test } from "vite-plus/test";
import { Tag } from "./Tag";
import { tag } from "./tag.styles";
import { renderWithTheme } from "../test/render-with-theme";

describe("Tag", () => {
  test("renders label text", () => {
    const view = renderWithTheme(() => <Tag>Work</Tag>);
    expect(view.getByText("Work")).toBeTruthy();
  });

  test("merges class prop", () => {
    const view = renderWithTheme(() => <Tag class="pill">Draft</Tag>);
    expect(view.getByText("Draft").className).toContain("pill");
  });

  test.each([
    ["accent", "Accent"],
    ["neutral", "Neutral"],
  ] as const)("renders %s tone", (tone, label) => {
    const view = renderWithTheme(() => <Tag tone={tone}>{label}</Tag>);
    expect(view.getByText(label)).toBeTruthy();
  });
});

describe("tag recipe", () => {
  test("neutral tone uses secondary text color token", () => {
    const [, styleFn] = tag({ tone: "neutral" });
    expect(Object.entries(styleFn())).toContainEqual(["--color", "var(--color_text-secondary)"]);
  });
});
