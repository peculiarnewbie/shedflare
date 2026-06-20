import { splitProps, type JSX } from "solid-js";
import { tag } from "./tag.styles";

type TagTone = "accent" | "neutral";

type TagProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, "style"> & {
  tone?: TagTone;
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
};

function Tag(props: TagProps) {
  const [local, rest] = splitProps(props, ["tone", "class", "style", "children"]);
  const [cn, styleFn] = tag({ tone: local.tone ?? "accent" });

  return (
    <span {...rest} class={cn(local.class)} style={styleFn(local.style)}>
      {local.children}
    </span>
  );
}

export { Tag, type TagProps, type TagTone };
