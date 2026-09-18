import { relations } from "drizzle-orm";
import { bigint, integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { providerContent } from "./provider_content.js";
export const content = pgTable(
  "content",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    altTitle: text("alt_title"),
    overview: text("overview"),
    year: integer("year").notNull(),
    type: text("type", {
      enum: ["movie", "series", "channel", "tv"],
    }).notNull(),
    imdbId: text("imdb_id"),
    tmdbId: text("tmdb_id"),
    tvdbId: text("tvdb_id"),
    poster: text("poster"),
    background: text("background"),
    logo: text("logo"),
    genres: text("genres"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }),
    ttl: bigint("ttl", { mode: "number" }),
  },
  (table) => [
    unique("uq_content_imdb").on(table.imdbId, table.type),
    unique("uq_content_tmdb").on(table.tmdbId, table.type),
    unique("uq_content_tvdb").on(table.tvdbId, table.type),
  ],
);
export const contentRelations = relations(content, ({ many }) => ({
  providerContent: many(providerContent),
}));

export type EContent = typeof content.$inferSelect;
export type EContentInsert = typeof content.$inferInsert;
