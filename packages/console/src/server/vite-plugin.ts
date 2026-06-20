import type { Plugin } from "vite";
import { handleApiRequest } from "./handler.ts";

export function consoleApiPlugin(): Plugin {
  return {
    name: "shedflare-console-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApiRequest(req, res).then((handled) => {
          if (!handled) next();
        });
      });
    },
  };
}
