import { For, Show } from "solid-js";

type ImageAttachment = {
  objectKey: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
};

type FileAttachment = {
  objectKey?: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
};

type MessageAttachmentsProps = {
  images: ImageAttachment[];
  files: FileAttachment[];
};

function formatBytes(bytes: number | undefined) {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toUpperCase().slice(0, 4) || "FILE";
}

function FileAttachmentContent(props: { attachment: FileAttachment }) {
  return (
    <>
      <span class="attachment-media">
        <span class="attachment-ext">{fileExtension(props.attachment.fileName)}</span>
      </span>
      <span class="attachment-content">
        <span class="attachment-title">{props.attachment.fileName}</span>
        <Show when={formatBytes(props.attachment.sizeBytes)}>
          {(size) => <span class="attachment-description">File • {size()}</span>}
        </Show>
      </span>
    </>
  );
}

export default function MessageAttachments(props: MessageAttachmentsProps) {
  return (
    <div class="attachment-group msg-attachment-group">
      <Show when={props.images.length > 0}>
        <For each={props.images}>
          {(att) => (
            <a
              class="attachment-card attachment-card-image"
              href={`/api/uploads/blob/${att.objectKey}`}
              target="_blank"
              rel="noreferrer"
              title={att.fileName}
            >
              <span class="attachment-media attachment-media-image">
                <img src={`/api/uploads/blob/${att.objectKey}`} alt="" loading="lazy" />
              </span>
              <span class="attachment-content">
                <span class="attachment-title">{att.fileName}</span>
                <Show when={formatBytes(att.sizeBytes)}>
                  {(size) => <span class="attachment-description">Image • {size()}</span>}
                </Show>
              </span>
            </a>
          )}
        </For>
      </Show>
      <Show when={props.files.length > 0}>
        <For each={props.files}>
          {(att) => (
            <Show
              when={att.objectKey}
              fallback={
                <span class="attachment-card attachment-card-file">
                  <FileAttachmentContent attachment={att} />
                </span>
              }
            >
              {(objectKey) => (
                <a
                  class="attachment-card attachment-card-file"
                  href={`/api/uploads/blob/${objectKey()}`}
                  target="_blank"
                  rel="noreferrer"
                  title={att.fileName}
                >
                  <FileAttachmentContent attachment={att} />
                </a>
              )}
            </Show>
          )}
        </For>
      </Show>
    </div>
  );
}
