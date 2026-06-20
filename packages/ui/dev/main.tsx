import { render } from "solid-js/web";
import "../dist/tokenami.css";
import App from "./App";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root");

render(() => <App />, root);
