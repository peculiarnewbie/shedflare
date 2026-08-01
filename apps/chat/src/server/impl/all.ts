import { HttpApiBuilder } from "effect/unstable/httpapi";
import { chatApi } from "../definitions";
import { handleBootstrap } from "../../api/bootstrap";
import { handleModels } from "../../api/models";
import { handleUploadPresign } from "../../api/uploads-presign";
import { handleUploadComplete } from "../../api/uploads-complete";
import { wrapHttpHandler } from "@shedflare/alchemy";

function wrapHandler(fn: (req: Request) => Promise<Response>) {
  return wrapHttpHandler(fn);
}

export function createBootstrapGroup() {
  const endpoints = (chatApi as any).groups["bootstrap"].endpoints;
  return (HttpApiBuilder.group as any)(chatApi, "bootstrap", (handlers: any) => {
    handlers.handlers.set("bootstrap", {
      endpoint: endpoints["bootstrap"],
      handler: wrapHandler(handleBootstrap),
      isRaw: true,
      uninterruptible: false,
    });
    return handlers;
  });
}

export function createModelsGroup() {
  const endpoint = (chatApi as any).groups["models"].endpoints["models"];
  return (HttpApiBuilder.group as any)(chatApi, "models", (handlers: any) => {
    handlers.handlers.set("models", {
      endpoint,
      handler: wrapHandler(handleModels),
      isRaw: true,
      uninterruptible: false,
    });
    return handlers;
  });
}

export function createUploadsGroup() {
  const endpoints = (chatApi as any).groups["uploads"].endpoints;
  return (HttpApiBuilder.group as any)(chatApi, "uploads", (handlers: any) => {
    handlers.handlers.set("presign", {
      endpoint: endpoints["presign"],
      handler: wrapHandler(handleUploadPresign),
      isRaw: true,
      uninterruptible: false,
    });
    handlers.handlers.set("complete", {
      endpoint: endpoints["complete"],
      handler: wrapHandler(handleUploadComplete),
      isRaw: true,
      uninterruptible: false,
    });
    return handlers;
  });
}
