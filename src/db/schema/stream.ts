import { bigint, index, pgTable, text } from "drizzle-orm/pg-core";
import { providerContent } from "./provider_content.js";
import { unique } from "drizzle-orm/pg-core/unique-constraint";

export const stream = pgTable(
  "stream",
  {
    id: text("id").primaryKey(),
    providerContentId: text("provider_content_id")
      .notNull()
      .references(() => providerContent.id),
    provider: text("provider").notNull(),
    externalId: text("external_id"),
    season: text("season").notNull(),
    episode: text("episode").notNull(),
    url: text("url").notNull(),
    playlist: text("playlist"),
    hash: text("hash"),
    resolution: text("resolution"),
    size: text("size"),
    duration: text("duration"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    ttl: bigint("ttl", { mode: "number" }),
  },
  (table) => [
    unique("uq_stream_url").on(table.url),
    unique("uq_stream_hash").on(table.hash),
    index("idx_stream_provider_id").on(table.providerContentId),
  ],
);

export type EStream = typeof stream.$inferSelect;
export type EStreamInsert = typeof stream.$inferInsert;
