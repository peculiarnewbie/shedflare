import { For, Show, createResource } from "solid-js";
import { fileGlyph, formatSize } from "../context";
import { BUILD_INFO } from "../lib/build-info";
import type { DriveFile } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeDriveFile(value: unknown): DriveFile | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.mimeType !== "string" ||
    typeof value.size !== "number" ||
    typeof value.description !== "string" ||
    typeof value.isPublic !== "boolean" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    !Array.isArray(value.tags) ||
    !value.tags.every((tag) => typeof tag === "string")
  ) {
    return null;
  }
  return value as DriveFile;
}

function decodePublicFiles(value: unknown): DriveFile[] {
  if (!isRecord(value) || !Array.isArray(value.files)) throw new Error("Invalid public files");
  const files = value.files.map(decodeDriveFile);
  if (files.some((file) => !file)) throw new Error("Invalid public files");
  return files as DriveFile[];
}

async function loadPublicFiles() {
  const response = await fetch("/api/public/files");
  if (!response.ok) throw new Error(await response.text());
  return decodePublicFiles(await response.json());
}

function previewUrl(file: DriveFile) {
  return `/public/files/${encodeURIComponent(file.id)}/preview`;
}

function downloadUrl(file: DriveFile) {
  return `/public/files/${encodeURIComponent(file.id)}/download`;
}

function PublicFileCard(props: { file: DriveFile }) {
  const file = props.file;
  const isImage = () => file.mimeType.startsWith("image/");

  return (
    <article class="public-file-card">
      <a class="public-preview" href={downloadUrl(file)} aria-label={`Download ${file.name}`}>
        <Show
          when={isImage()}
          fallback={
            <span class={`file-mark ${fileGlyph(file).toLowerCase()}`}>{fileGlyph(file)}</span>
          }
        >
          <img src={previewUrl(file)} alt={file.name} loading="lazy" />
        </Show>
      </a>
      <div class="public-file-body">
        <h2>{file.name}</h2>
        <p>{file.description || file.mimeType}</p>
        <div class="public-meta">
          <span>{formatSize(file.size)}</span>
          <span>{new Date(file.createdAt).toLocaleDateString()}</span>
        </div>
        <div class="public-actions">
          <a class="btn btn-primary" href={downloadUrl(file)}>
            Download
          </a>
          <Show when={file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/")}>
            <a class="btn" href={previewUrl(file)} target="_blank" rel="noreferrer">
              Preview
            </a>
          </Show>
        </div>
      </div>
    </article>
  );
}

export default function PublicFiles() {
  const [files] = createResource(loadPublicFiles);

  return (
    <>
      <header class="top-bar">
        <a class="top-bar-brand" href="/">
          <span class="top-bar-dot" />
          <span class="top-bar-title">Shedflare Drive</span>
        </a>
        <span class="build-marker" title={BUILD_INFO.tooltip}>
          {BUILD_INFO.label}
        </span>
        <a class="btn top-bar-signout" href="/">
          Private drive
        </a>
      </header>

      <main class="public-page">
        <div class="public-heading">
          <p>Public files</p>
          <h1>Shared from Shedflare Drive</h1>
        </div>

        <Show
          when={!files.loading}
          fallback={<div class="public-empty">Loading public files...</div>}
        >
          <Show
            when={!files.error}
            fallback={<div class="public-empty">Could not load public files.</div>}
          >
            <Show
              when={(files() ?? []).length > 0}
              fallback={<div class="public-empty">No files are public right now.</div>}
            >
              <div class="public-grid">
                <For each={files()}>{(file) => <PublicFileCard file={file} />}</For>
              </div>
            </Show>
          </Show>
        </Show>
      </main>
    </>
  );
}
