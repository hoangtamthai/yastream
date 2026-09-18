import { relations } from "drizzle-orm";
import { bigint, pgTable, text, unique } from "drizzle-orm/pg-core";
import { providerContent } from "./provider_content.js";
export const ouo = pgTable("ouo", {
  id: text("id").primaryKey(),
  originalUrl: text("original_url").notNull(),
  redirectedUrl: text("redirected_url"),
  password: text("password"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const ouoRelations = relations(ouo, ({ one }) => ({
  providerContent: one(providerContent),
}));

export type EOuo = typeof ouo.$inferSelect;
export type EOuoInsert = typeof ouo.$inferInsert;
