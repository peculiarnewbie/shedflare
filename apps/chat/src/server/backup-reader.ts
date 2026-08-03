import type { SyncSnapshot } from "#/domain";
import * as dbSchema from "#/db/schema";
import { asc } from "drizzle-orm";
import type { DataAccess } from "./data-access";
import type { SnapshotReader } from "./snapshot-reader";

export type ChatBackupEvent = {
  seq: number;
  eventId: string;
  opId: string | null;
  type: string;
  payloadJson: string;
  createdAt: string;
};

export type ChatBackupCommand = {
  opId: string;
  type: string;
  status: string;
  responseJson: string | null;
  createdAt: string;
  ackedSeq: number | null;
};

export type ChatBackup = {
  version: 1;
  app: "chat";
  createdAt: string;
  protocolVersion: string;
  serverSeq: number;
  snapshot: SyncSnapshot;
  events: ChatBackupEvent[];
  commands: ChatBackupCommand[];
};

type BackupReaderInput = {
  access: DataAccess;
  snapshots: SnapshotReader;
};

export class BackupReader {
  private readonly access: DataAccess;
  private readonly snapshots: SnapshotReader;

  constructor({ access, snapshots }: BackupReaderInput) {
    this.access = access;
    this.snapshots = snapshots;
  }

  getBackup(input: { createdAt: string; protocolVersion: string }): ChatBackup {
    const snapshot = this.snapshots.getSnapshot();
    const events = this.access.database.runSync(
      this.access.db
        .select({
          seq: dbSchema.events.seq,
          eventId: dbSchema.events.eventId,
          opId: dbSchema.events.opId,
          type: dbSchema.events.type,
          payloadJson: dbSchema.events.payloadJson,
          createdAt: dbSchema.events.createdAt,
        })
        .from(dbSchema.events)
        .orderBy(asc(dbSchema.events.seq)),
    );
    const commands = this.access.database.runSync(
      this.access.db
        .select({
          opId: dbSchema.commands.opId,
          type: dbSchema.commands.type,
          status: dbSchema.commands.status,
          responseJson: dbSchema.commands.responseJson,
          createdAt: dbSchema.commands.createdAt,
          ackedSeq: dbSchema.commands.ackedSeq,
        })
        .from(dbSchema.commands)
        .orderBy(asc(dbSchema.commands.createdAt), asc(dbSchema.commands.opId)),
    );

    return {
      version: 1,
      app: "chat",
      createdAt: input.createdAt,
      protocolVersion: input.protocolVersion,
      serverSeq: snapshot.serverSeq ?? this.access.getLastServerSeq(),
      snapshot,
      events,
      commands,
    };
  }
}
