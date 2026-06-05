import { eq, and } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createTag } from "../../domain/factories";
import type { CommandPayloadMap } from "../../domain/commands";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

type TagCommand = "create_tag" | "delete_tag" | "add_transaction_tag" | "remove_transaction_tag";

export async function handleTagCommands(
  c: TagCommand,
  p: CommandPayloadMap[TagCommand],
  db: Db,
): Promise<CR> {
  switch (c) {
    case "create_tag": {
      const pp = p as CommandPayloadMap["create_tag"];
      const r = createTag(pp);
      await db.insert(s.tags).values(r);
      return { ok: true, data: { id: r.id } };
    }
    case "delete_tag": {
      const pp = p as CommandPayloadMap["delete_tag"];
      await db.delete(s.transactionTags).where(eq(s.transactionTags.tagId, pp.id));
      await db.delete(s.tags).where(eq(s.tags.id, pp.id));
      return { ok: true, data: { id: pp.id } };
    }
    case "add_transaction_tag": {
      const pp = p as CommandPayloadMap["add_transaction_tag"];
      await db
        .insert(s.transactionTags)
        .values({ transactionId: pp.transactionId, tagId: pp.tagId })
        .onConflictDoNothing({
          target: [s.transactionTags.transactionId, s.transactionTags.tagId],
        });
      return { ok: true, data: { transactionId: pp.transactionId, tagId: pp.tagId } };
    }
    case "remove_transaction_tag": {
      const pp = p as CommandPayloadMap["remove_transaction_tag"];
      await db
        .delete(s.transactionTags)
        .where(
          and(
            eq(s.transactionTags.transactionId, pp.transactionId),
            eq(s.transactionTags.tagId, pp.tagId),
          ),
        );
      return { ok: true, data: { transactionId: pp.transactionId, tagId: pp.tagId } };
    }
    default:
      return { ok: false, error: `Unknown tag command: ${c}` };
  }
}
