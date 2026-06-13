import { render } from "solid-js/web";
import App from "./app";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

render(() => <App />, document.getElementById("app")!);
