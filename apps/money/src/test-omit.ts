import * as Schema from "effect/Schema";
import { createInsertSchema } from "drizzle-orm/effect-schema";
import { transactions } from "./db/schema";

const base = createInsertSchema(transactions);

// Try different omit syntaxes
const a = Schema.omit(base, "id");
const b = Schema.pick(base, "accountId", "amount");

console.log(a, b);
