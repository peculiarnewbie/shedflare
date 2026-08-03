// Keep the pool entrypoint minimal: importing the production router also loads
// browser/runtime modules that are not needed to construct the Durable Object.
export { SyncEngineDurableObject } from "../../src/server/sync-engine";

export default {
  fetch(): Response {
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler;
