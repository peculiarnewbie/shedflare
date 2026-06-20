import { splitProps, type JSX } from "solid-js";
import { panel } from "./panel.styles";

type PanelPadding = "none" | "sm" | "md" | "lg";

type PanelProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "style"> & {
  padding?: PanelPadding;
  elevated?: boolean;
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
};

function Panel(props: PanelProps) {
  const [local, rest] = splitProps(props, ["padding", "elevated", "class", "style", "children"]);
  const [cn, styleFn] = panel({
    padding: local.padding ?? "md",
    elevated: local.elevated ?? false,
  });

  return (
    <div {...rest} class={cn(local.class)} style={styleFn(local.style)}>
      {local.children}
    </div>
  );
}

export { Panel, type PanelPadding, type PanelProps };
