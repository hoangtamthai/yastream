import {
  bigint,
  index,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { providerContent } from "./provider_content.js";
export const subtitle = pgTable(
  "subtitle",
  {
    id: text("id").primaryKey(),
    providerContentId: text("provider_content_id")
      .notNull()
      .references(() => providerContent.id),
    season: text("season"),
    episode: text("episode"),
    url: text("url").notNull(),
    lang: text("lang").notNull(),
    subtitle: text("subtitle"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    ttl: bigint("ttl", { mode: "number" }),
  },
  (table) => [
    unique("uq_subtitles_url").on(table.url),
    unique("uq_subtitles_provider_season_episode_lang").on(
      table.providerContentId,
      table.season,
      table.episode,
      table.lang,
    ),
    index("idx_subtitle_provider_id").on(table.providerContentId),
  ],
);

export type ESubtitle = typeof subtitle.$inferSelect;
export type ESubtitleInsert = typeof subtitle.$inferInsert;
