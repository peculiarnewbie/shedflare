import { eq, and } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createTag } from "../../domain/factories";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export async function handleTagCommands(c: string, p: any, db: Db): Promise<CR> {
  switch (c) {
    case "create_tag": {
      const r = createTag(p);
      await db.insert(s.tags).values(r);
      return { ok: true, data: { id: r.id } };
    }
    case "delete_tag": {
      await db.delete(s.transactionTags).where(eq(s.transactionTags.tagId, p.id));
      await db.delete(s.tags).where(eq(s.tags.id, p.id));
      return { ok: true, data: { id: p.id } };
    }
    case "add_transaction_tag": {
      await db
        .insert(s.transactionTags)
        .values({ transactionId: p.transactionId, tagId: p.tagId })
        .onConflictDoNothing({
          target: [s.transactionTags.transactionId, s.transactionTags.tagId],
        });
      return { ok: true, data: { transactionId: p.transactionId, tagId: p.tagId } };
    }
    case "remove_transaction_tag": {
      await db
        .delete(s.transactionTags)
        .where(
          and(
            eq(s.transactionTags.transactionId, p.transactionId),
            eq(s.transactionTags.tagId, p.tagId),
          ),
        );
      return { ok: true, data: { transactionId: p.transactionId, tagId: p.tagId } };
    }
    default:
      return { ok: false, error: `Unknown tag command: ${c}` };
  }
}
