import { SYNC_PROTOCOL_VERSION } from "#/domain";
import * as dbSchema from "#/db/schema";
import type { ChatBackup } from "./backup-reader";
import type { DataAccess } from "./data-access";
import { EventProjector } from "./event-projector";
import { resetForProtocolVersion } from "./schema-helpers";
import type { ChatRepository } from "./chat-repository";

export type ChatRestoreResult = {
  restoredAt: string;
  backupCreatedAt: string;
  serverSeq: number;
  counts: {
    events: number;
    commands: number;
    aiThreads: number;
    aiRuns: number;
    aiInterrupts: number;
    aiMetadata: number;
  };
};

export class BackupRestorer {
  constructor(
    private readonly access: DataAccess,
    private readonly repository: ChatRepository,
  ) {}

  restore(backup: ChatBackup): ChatRestoreResult {
    if (backup.protocolVersion !== SYNC_PROTOCOL_VERSION) {
      throw new Error(
        `Backup protocol ${backup.protocolVersion} is incompatible with ${SYNC_PROTOCOL_VERSION}.`,
      );
    }
    const maxEventSeq = backup.events.at(-1)?.seq ?? 0;
    if (maxEventSeq !== backup.serverSeq) {
      throw new Error(
        `Backup event sequence ${maxEventSeq} does not match serverSeq ${backup.serverSeq}.`,
      );
    }

    const restoredAt = new Date().toISOString();
    const projector = new EventProjector({ sql: this.access, repository: this.repository });
    const ai = backup.version === 2 ? backup.ai : null;

    this.access.database.storage.transactionSync(() => {
      resetForProtocolVersion((query, ...params) => this.access.exec(query, ...params));
      projector.apply({
        eventType: "server_state_rebased",
        payload: { snapshot: backup.snapshot },
      });

      if (backup.events.length > 0) {
        this.access.database.runSync(this.access.db.insert(dbSchema.events).values(backup.events));
      }
      if (backup.commands.length > 0) {
        this.access.database.runSync(
          this.access.db.insert(dbSchema.commands).values(backup.commands),
        );
      }
      if (ai?.threads.length) {
        this.access.database.runSync(this.access.db.insert(dbSchema.aiThreads).values(ai.threads));
      }
      if (ai?.runs.length) {
        this.access.database.runSync(
          this.access.db
            .insert(dbSchema.aiRuns)
            .values(
              ai.runs.map((run) =>
                run.status === "running" || run.status === "interrupted"
                  ? { ...run, status: "aborted" as const, finishedAt: Date.now() }
                  : run,
              ),
            ),
        );
      }
      if (ai?.interrupts.length) {
        this.access.database.runSync(
          this.access.db
            .insert(dbSchema.aiInterrupts)
            .values(
              ai.interrupts.map((interrupt) =>
                interrupt.status === "pending"
                  ? { ...interrupt, status: "cancelled" as const, resolvedAt: Date.now() }
                  : interrupt,
              ),
            ),
        );
      }
      if (ai?.metadata.length) {
        this.access.database.runSync(
          this.access.db.insert(dbSchema.aiMetadata).values(ai.metadata),
        );
      }
      this.access.exec(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES ('sync_protocol_version', ?)",
        SYNC_PROTOCOL_VERSION,
      );
    });

    return {
      restoredAt,
      backupCreatedAt: backup.createdAt,
      serverSeq: backup.serverSeq,
      counts: {
        events: backup.events.length,
        commands: backup.commands.length,
        aiThreads: ai?.threads.length ?? 0,
        aiRuns: ai?.runs.length ?? 0,
        aiInterrupts: ai?.interrupts.length ?? 0,
        aiMetadata: ai?.metadata.length ?? 0,
      },
    };
  }
}
