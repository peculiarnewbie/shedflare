import type { IncomingMessage, ServerResponse } from "node:http";
import { handleApiRequest } from "./handler.ts";

type DevServer = {
  middlewares: {
    use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): void;
  };
};

type DevServerPlugin = {
  name: string;
  configureServer(server: DevServer): void;
};

export function consoleApiPlugin(): DevServerPlugin {
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
