import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { content } from "./content.js";

export const providerContent = pgTable(
  "provider_content",
  {
    id: text("id").primaryKey(),
    contentId: text("content_id").references(() => content.id),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    year: integer("year").notNull(),
    type: text("type", {
      enum: ["movie", "series", "channel", "tv"],
    }).notNull(),
    image: text("image"),
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
  },
  (table) => [
    index("idx_provider_content_external_id").on(
      table.provider,
      table.externalId,
    ),
  ],
);

export type EProviderContent = typeof providerContent.$inferSelect;
export type EProviderContentInsert = typeof providerContent.$inferInsert;
