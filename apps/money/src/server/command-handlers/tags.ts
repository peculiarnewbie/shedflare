import { eq, and } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createTag } from "../../domain/factories";
import type { CommandInvocation } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

type TagCommand = "create_tag" | "delete_tag" | "add_transaction_tag" | "remove_transaction_tag";

type TagInvocation = Extract<CommandInvocation, { commandType: TagCommand }>;
export async function handleTagCommands(command: TagInvocation, db: Db): Promise<CommandResult> {
  switch (command.commandType) {
    case "create_tag": {
      const pp = command.payload;
      const r = createTag(pp);
      await db.insert(s.tags).values(r).run();
      return { ok: true, data: { id: r.id } };
    }
    case "delete_tag": {
      const pp = command.payload;
      await db.delete(s.transactionTags).where(eq(s.transactionTags.tagId, pp.id)).run();
      await db.delete(s.tags).where(eq(s.tags.id, pp.id)).run();
      return { ok: true, data: { id: pp.id } };
    }
    case "add_transaction_tag": {
      const pp = command.payload;
      await db
        .insert(s.transactionTags)
        .values({ transactionId: pp.transactionId, tagId: pp.tagId })
        .onConflictDoNothing({
          target: [s.transactionTags.transactionId, s.transactionTags.tagId],
        })
        .run();
      return { ok: true, data: { transactionId: pp.transactionId, tagId: pp.tagId } };
    }
    case "remove_transaction_tag": {
      const pp = command.payload;
      await db
        .delete(s.transactionTags)
        .where(
          and(
            eq(s.transactionTags.transactionId, pp.transactionId),
            eq(s.transactionTags.tagId, pp.tagId),
          ),
        )
        .run();
      return { ok: true, data: { transactionId: pp.transactionId, tagId: pp.tagId } };
    }
    default:
      return { ok: false, error: "Unknown tag command" };
  }
}
