import { bigint, pgTable, text, timestamp } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  ttl: bigint("ttl", { mode: "number" }),
});

export type EMkvdrama = typeof mkvdrama.$inferSelect;
export type EMkvdramaInsert = typeof mkvdrama.$inferInsert;
