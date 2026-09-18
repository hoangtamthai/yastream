import { bigint, index, integer, pgTable, text } from "drizzle-orm/pg-core";
export const kv = pgTable(
  "kv",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    size: integer("size"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  },
  (table) => [index("idx_kv_expires_at").on(table.expiresAt)],
);

export type EKV = typeof kv.$inferSelect;
export type EKVInsert = typeof kv.$inferInsert;
