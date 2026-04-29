export const BASE_CONFIGS: Record<string, Record<string, unknown>> = {
  auth: {
    $schema: "node_modules/wrangler/config-schema.json",
    name: "shedflare-auth",
    main: "src/worker.ts",
    compatibility_date: "2026-03-22",
    compatibility_flags: ["nodejs_compat"],
    observability: {
      enabled: true,
      head_sampling_rate: 1,
    },
    kv_namespaces: [
      {
        binding: "OPENAUTH_STORAGE",
      },
    ],
  },
  chat: {
    $schema: "node_modules/wrangler/config-schema.json",
    name: "shedflare-chat",
    main: "src/worker.ts",
    compatibility_date: "2026-03-22",
    compatibility_flags: ["nodejs_compat"],
    observability: {
      enabled: true,
      head_sampling_rate: 1,
    },
    assets: {
      directory: "dist/client",
      binding: "ASSETS",
      html_handling: "none",
      not_found_handling: "none",
    },
    r2_buckets: [
      {
        binding: "UPLOADS",
      },
    ],
    durable_objects: {
      bindings: [
        {
          name: "SYNC_ENGINE",
          class_name: "SyncEngineDurableObject",
        },
      ],
    },
    browser: {
      binding: "BROWSER",
    },
    migrations: [
      {
        tag: "v1",
        new_sqlite_classes: ["SyncEngineDurableObject"],
      },
    ],
  },
  drive: {
    $schema: "node_modules/wrangler/config-schema.json",
    name: "shedflare-drive",
    main: "src/worker.ts",
    compatibility_date: "2026-03-22",
    compatibility_flags: ["nodejs_compat"],
    observability: {
      enabled: true,
      head_sampling_rate: 1,
    },
    assets: {
      directory: "dist/client",
      binding: "ASSETS",
      html_handling: "none",
      not_found_handling: "none",
    },
    r2_buckets: [
      {
        binding: "FILES",
      },
    ],
    d1_databases: [
      {
        binding: "DB",
      },
    ],
  },
};
