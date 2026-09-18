import { relations } from "drizzle-orm";
import { bigint, pgTable, text } from "drizzle-orm/pg-core";
import { ouo } from "./ouo.js";
import { providerContent } from "./provider_content.js";
export const mkvdrama = pgTable("mkvdrama", {
  id: text("id").primaryKey(),
  providerContentId: text("provider_content_id")
    .notNull()
    .references(() => providerContent.id),
  ouoId: text("ouo_id")
    .unique()
    .references(() => ouo.id),
  quality: text("quality").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),
  ttl: bigint("ttl", { mode: "number" }),
});

export const mkvdramaRelations = relations(mkvdrama, ({ one }) => ({
  providerContent: one(providerContent, {
    fields: [mkvdrama.providerContentId],
    references: [providerContent.id],
  }),
  ouo: one(ouo, {
    fields: [mkvdrama.ouoId],
    references: [ouo.id],
  }),
}));

export type EMkvdrama = typeof mkvdrama.$inferSelect;
export type EMkvdramaInsert = typeof mkvdrama.$inferInsert;
