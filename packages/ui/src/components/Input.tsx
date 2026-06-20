import { splitProps, type JSX } from "solid-js";
import type { TokenamiStyle } from "@tokenami/css";
import { input } from "./input.styles";

type InputProps = TokenamiStyle<JSX.InputHTMLAttributes<HTMLInputElement>> & {
  class?: string;
  style?: JSX.CSSProperties;
};

function Input(props: InputProps) {
  const [local, rest] = splitProps(props, ["class", "style"]);
  const [cn, styleFn] = input();

  return <input {...rest} class={cn(local.class)} style={styleFn(local.style)} />;
}

export { Input, type InputProps };
