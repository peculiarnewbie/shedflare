import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const watchLaterVideos = sqliteTable(
  "watch_later_videos",
  {
    videoId: text("video_id").primaryKey(),
    title: text("title").notNull(),
    channelId: text("channel_id").notNull(),
    channelName: text("channel_name").notNull(),
    durationSeconds: integer("duration_seconds"),
    thumbnailUrl: text("thumbnail_url"),
    publishedAt: text("published_at"),
    addedAt: text("added_at"),
    sortOrder: integer("sort_order").notNull().default(0),
    syncedAt: text("synced_at").notNull(),
    pruned: integer("pruned", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    index("idx_wlv_channel").on(table.channelId),
    index("idx_wlv_synced").on(table.syncedAt),
    index("idx_wlv_pruned").on(table.pruned),
  ],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id"),
    channelName: text("channel_name").notNull(),
    channelAvatarUrl: text("channel_avatar_url"),
    videoId: text("video_id"),
    title: text("title").notNull(),
    type: text("type").notNull().default("upload"),
    timestamp: text("timestamp").notNull(),
    syncedAt: text("synced_at").notNull(),
    read: integer("read", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    index("idx_notif_channel").on(table.channelId),
    index("idx_notif_timestamp").on(table.timestamp),
    index("idx_notif_read").on(table.read),
  ],
);

export type WatchLaterVideoRow = typeof watchLaterVideos.$inferSelect;
export type NewWatchLaterVideoRow = typeof watchLaterVideos.$inferInsert;
export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
