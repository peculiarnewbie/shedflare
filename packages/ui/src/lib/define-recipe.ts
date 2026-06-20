import { css } from "../css";

type ComposeInput = Parameters<typeof css.compose>[0];

/** Wraps `css.compose` while Tokenami's TS plugin is not active in `vp check`. */
export function defineRecipe(recipe: ComposeInput) {
  return css.compose(recipe);
}
