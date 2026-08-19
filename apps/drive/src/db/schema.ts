import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    objectKey: text("object_key").notNull().unique(),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    description: text("description"),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_files_created_at").on(table.createdAt),
    index("idx_files_is_public_created_at").on(table.isPublic, table.createdAt),
    index("idx_files_name").on(table.name),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull().unique(),
  },
  (table) => [index("idx_tags_normalized_name").on(table.normalizedName)],
);

export const fileTags = sqliteTable(
  "file_tags",
  {
    fileId: text("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.fileId, table.tagId] })],
);

export const secureUploadStartCapabilities = sqliteTable(
  "secure_upload_start_capabilities",
  {
    nonce: text("nonce").primaryKey(),
    expiresAt: integer("expires_at").notNull(),
    consumedAt: integer("consumed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_secure_upload_starts_expires_at").on(table.expiresAt)],
);

export const secureUploadSessions = sqliteTable(
  "secure_upload_sessions",
  {
    uploadId: text("upload_id").primaryKey(),
    fileId: text("file_id").notNull().unique(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_secure_upload_sessions_expires_at").on(table.expiresAt)],
);

export type FileRow = typeof files.$inferSelect;
export type NewFileRow = typeof files.$inferInsert;
export type TagRow = typeof tags.$inferSelect;
