import { splitProps, type JSX } from "solid-js";
import { button } from "./button.styles";

type ButtonVariant = "default" | "primary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "style"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
};

function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["variant", "size", "class", "style", "children"]);
  const [cn, styleFn] = button({
    variant: local.variant ?? "default",
    size: local.size ?? "md",
  });

  return (
    <button type="button" {...rest} class={cn(local.class)} style={styleFn(local.style)}>
      {local.children}
    </button>
  );
}

export { Button, type ButtonProps, type ButtonSize, type ButtonVariant };
