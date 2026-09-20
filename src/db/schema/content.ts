import {
  bigint,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
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
    unique("uq_content_imdb").on(table.imdbId, table.type),
    unique("uq_content_tmdb").on(table.tmdbId, table.type),
    unique("uq_content_tvdb").on(table.tvdbId, table.type),
  ],
);

export type EContent = typeof content.$inferSelect;
export type EContentInsert = typeof content.$inferInsert;
