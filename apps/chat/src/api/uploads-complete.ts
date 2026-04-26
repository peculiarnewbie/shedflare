import { getRuntimeEnv, requireSession, sendInternalSyncCommand } from "@shedflare/chat-server";
import { decodeAttachmentRow } from "@shedflare/chat-domain";
import { runApiTrace } from "../server/api-tracing";

export async function handleUploadComplete(request: Request): Promise<Response> {
  const env = getRuntimeEnv();
  return runApiTrace({
    scope: "upload-api",
    name: "upload.complete",
    kind: "io",
    env,
    attrs: {
      method: request.method,
      path: new URL(request.url).pathname,
    },
    run: async () => {
      await requireSession(request, env, { refresh: false });
      const body = (await request.json()) as { attachment: unknown };
      const attachment = decodeAttachmentRow(body.attachment);
      const object = await env.UPLOADS.head(attachment.objectKey);
      if (!object) return new Response("Uploaded object not found", { status: 404 });

      await sendInternalSyncCommand(env, "complete_attachment", {
        attachment: {
          ...attachment,
          status: "ready",
          sizeBytes: object.size,
          updatedAt: new Date().toISOString(),
          optimistic: false,
          opId: attachment.opId,
        },
      });

      return Response.json({
        ok: true,
        objectKey: attachment.objectKey,
      });
    },
  });
}
