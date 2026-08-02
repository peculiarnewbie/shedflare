import { HttpApiBuilder } from "effect/unstable/httpapi";
import { chatApi } from "../definitions";
import { handleBootstrap } from "../../api/bootstrap";
import { handleModels } from "../../api/models";
import { handleUploadPresign } from "../../api/uploads-presign";
import { handleUploadComplete } from "../../api/uploads-complete";
import { wrapHttpHandler } from "@shedflare/alchemy";

export function createBootstrapGroup() {
  return HttpApiBuilder.group(chatApi, "bootstrap", (handlers) =>
    handlers.handleRaw("bootstrap", wrapHttpHandler(handleBootstrap)),
  );
}

export function createModelsGroup() {
  return HttpApiBuilder.group(chatApi, "models", (handlers) =>
    handlers.handleRaw("models", wrapHttpHandler(handleModels)),
  );
}

export function createUploadsGroup() {
  return HttpApiBuilder.group(chatApi, "uploads", (handlers) =>
    handlers
      .handleRaw("presign", wrapHttpHandler(handleUploadPresign))
      .handleRaw("complete", wrapHttpHandler(handleUploadComplete)),
  );
}
