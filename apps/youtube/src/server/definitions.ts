import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

const VideoRow = Schema.Struct({
  videoId: Schema.String,
  title: Schema.String,
  channelId: Schema.String,
  channelName: Schema.String,
  durationSeconds: Schema.optional(Schema.Number),
  thumbnailUrl: Schema.optional(Schema.String),
  publishedAt: Schema.optional(Schema.String),
  addedAt: Schema.optional(Schema.String),
  sortOrder: Schema.Number,
  syncedAt: Schema.String,
  pruned: Schema.Boolean,
});

const NotifRow = Schema.Struct({
  id: Schema.String,
  channelId: Schema.optional(Schema.String),
  channelName: Schema.String,
  channelAvatarUrl: Schema.optional(Schema.String),
  videoId: Schema.optional(Schema.String),
  title: Schema.String,
  type: Schema.String,
  timestamp: Schema.String,
  syncedAt: Schema.String,
  read: Schema.Boolean,
});

// --- Dashboard ---

const dashboardEp: any = { ...HttpApiEndpoint.get("dashboard", "/api/dashboard") };
dashboardEp.success.add(
  Schema.Struct({
    watchLaterCount: Schema.Number,
    unreadNotifCount: Schema.Number,
    totalNotifs: Schema.Number,
    recentWatchLater: Schema.Array(VideoRow),
    recentNotifications: Schema.Array(NotifRow),
  }),
);

const dashboardGroup: any = HttpApiGroup.make("dashboard");
dashboardGroup.endpoints["dashboard"] = dashboardEp;

// --- Watch Later ---

const wlListEp: any = { ...HttpApiEndpoint.get("list", "/api/watch-later") };
wlListEp.success.add(Schema.Struct({ videos: Schema.Array(VideoRow) }));

const wlPruneEp: any = { ...HttpApiEndpoint.post("prune", "/api/watch-later/:videoId/prune") };
wlPruneEp.params = Schema.Struct({ videoId: Schema.String });
wlPruneEp.success.add(Schema.Struct({ ok: Schema.Boolean }));

const wlUnpruneEp: any = {
  ...HttpApiEndpoint.post("unprune", "/api/watch-later/:videoId/unprune"),
};
wlUnpruneEp.params = Schema.Struct({ videoId: Schema.String });
wlUnpruneEp.success.add(Schema.Struct({ ok: Schema.Boolean }));

const watchLaterGroup: any = HttpApiGroup.make("watchLater");
watchLaterGroup.endpoints["list"] = wlListEp;
watchLaterGroup.endpoints["prune"] = wlPruneEp;
watchLaterGroup.endpoints["unprune"] = wlUnpruneEp;

// --- Notifications ---

const notifListEp: any = { ...HttpApiEndpoint.get("list", "/api/notifications") };
notifListEp.success.add(Schema.Struct({ notifications: Schema.Array(NotifRow) }));

const notifReadEp: any = { ...HttpApiEndpoint.post("read", "/api/notifications/:id/read") };
notifReadEp.params = Schema.Struct({ id: Schema.String });
notifReadEp.success.add(Schema.Struct({ ok: Schema.Boolean }));

const notifReadAllEp: any = { ...HttpApiEndpoint.post("readAll", "/api/notifications/read-all") };
notifReadAllEp.success.add(Schema.Struct({ ok: Schema.Boolean }));

const notificationsGroup: any = HttpApiGroup.make("notifications");
notificationsGroup.endpoints["list"] = notifListEp;
notificationsGroup.endpoints["read"] = notifReadEp;
notificationsGroup.endpoints["readAll"] = notifReadAllEp;

// --- Sync ---

const syncEp: any = { ...HttpApiEndpoint.post("sync", "/api/sync") };
syncEp.payload.set("application/json", {
  encoding: { _tag: "Json" },
  schemas: [
    Schema.Struct({
      syncedAt: Schema.String,
      watchLater: Schema.optional(
        Schema.Array(
          Schema.Struct({
            videoId: Schema.String,
            title: Schema.String,
            channelId: Schema.String,
            channelName: Schema.String,
            durationSeconds: Schema.optional(Schema.Number),
            thumbnailUrl: Schema.optional(Schema.String),
            publishedAt: Schema.optional(Schema.String),
            addedAt: Schema.optional(Schema.String),
            sortOrder: Schema.Number,
          }),
        ),
      ),
      notifications: Schema.optional(
        Schema.Array(
          Schema.Struct({
            id: Schema.String,
            channelId: Schema.optional(Schema.String),
            channelName: Schema.String,
            channelAvatarUrl: Schema.optional(Schema.String),
            videoId: Schema.optional(Schema.String),
            title: Schema.String,
            type: Schema.String,
            timestamp: Schema.String,
          }),
        ),
      ),
    }),
  ],
});
syncEp.success.add(Schema.Struct({ ok: Schema.Boolean, syncedAt: Schema.String }));
syncEp.error.add(Schema.Struct({ error: Schema.String }));

const syncGroup: any = HttpApiGroup.make("sync");
syncGroup.endpoints["sync"] = syncEp;

// --- API ---

export const youtubeApi: any = HttpApi.make("youtube");
youtubeApi.groups["dashboard"] = dashboardGroup;
youtubeApi.groups["watchLater"] = watchLaterGroup;
youtubeApi.groups["notifications"] = notificationsGroup;
youtubeApi.groups["sync"] = syncGroup;
