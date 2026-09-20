import { bigint, pgTable, text } from "drizzle-orm/pg-core";
export const ouo = pgTable("ouo", {
  id: text("id").primaryKey(),
  originalUrl: text("original_url").notNull(),
  redirectedUrl: text("redirected_url"),
  password: text("password"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export type EOuo = typeof ouo.$inferSelect;
export type EOuoInsert = typeof ouo.$inferInsert;
