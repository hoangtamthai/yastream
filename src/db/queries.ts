import type { ContentType } from "@stremio-addon/sdk";
import { and, count, eq, lt, sql } from "drizzle-orm";
import type { ContentDetail } from "../source/meta.js";
import { handleError } from "../utils/error.js";
import { Logger } from "../utils/logger.js";
import { db } from "./drizzle.js";
import { content, EContentInsert, type EContent } from "./schema/content.js";
import { EKVInsert, kv } from "./schema/kv.js";
import {
  EProviderContentInsert,
  providerContent,
  type EProviderContent,
} from "./schema/provider_content.js";
import { EStreamInsert, stream } from "./schema/stream.js";
import { ESubtitleInsert, subtitle } from "./schema/subtitle.js";

const logger = new Logger("DB");

// CONTENT
export async function upsertContent(
  id: string,
  contentData: ContentDetail,
  ttlMs: number,
) {
  if (!db) return;
  const now = Date.now();
  const row: EContentInsert = {
    id: id,
    title: contentData.title,
    altTitle: contentData.altTitle ?? null,
    overview: contentData.overview,
    year: contentData.year,
    type: contentData.type,
    imdbId: contentData.imdbId?.toString() ?? null,
    tmdbId: contentData.tmdbId?.toString() ?? null,
    tvdbId: contentData.tvdbId?.toString() ?? null,
    poster: contentData.thumbnail,
    background: contentData.thumbnail,
    logo: contentData.logo ?? null,
    genres: null,
    createdAt: now,
    updatedAt: null,
    ttl: Math.floor(ttlMs / 1000),
  };

  try {
    await db
      .insert(content)
      .values(row)
      .onConflictDoUpdate({
        target: content.id,
        set: {
          title: row.title,
          altTitle: row.altTitle,
          overview: row.overview,
          year: row.year,
          type: row.type,
          imdbId: row.imdbId,
          tmdbId: row.tmdbId,
          tvdbId: row.tvdbId,
          poster: row.poster,
          background: row.background,
          logo: row.logo,
          genres: row.genres,
          updatedAt: now,
          ttl: row.ttl,
        },
      });
    logger.debug(`Upserted content ${contentData.title}`);
  } catch (e: any) {
    handleError(e, logger, `Failed to upsert content ${contentData.title}`);
  }
}

export async function getContentByTmdb(
  tmdbId: string,
  type: ContentType,
): Promise<EContent | undefined> {
  if (!db) return;
  const row = await db.query.content.findFirst({
    where: {
      tmdbId: tmdbId,
      type: type,
    },
  });
  return row;
}

export async function getProviderContentsById(id: string) {
  if (!db) return;
  const rows = await db.query.content.findFirst({
    where: {
      id: id,
    },
    with: {
      providerContent: true,
    },
  });
  return rows;
}

export async function getContentJoinProviderById(
  type: ContentType,
  imdbId?: string,
  tmdbId?: number,
  tvdbId?: number,
) {
  if (!db) return;
  const row = await db.query.content.findFirst({
    where: {
      type: type,
      OR: [
        {
          imdbId: imdbId,
        },
        {
          tmdbId: tmdbId?.toString(),
        },
        {
          tvdbId: tvdbId?.toString(),
        },
      ],
    },
    with: {
      providerContent: true,
    },
  });
  return row;
}

// PROVIDER_CONTENT
export async function upsertProviderContent(
  providerContentData: Omit<EProviderContentInsert, "createdAt" | "updatedAt">,
) {
  if (!db) return;
  const now = Date.now();
  const row = { ...providerContentData, createdAt: now, updatedAt: null };

  try {
    await db
      .insert(providerContent)
      .values(row)
      .onConflictDoUpdate({
        target: providerContent.id,
        set: {
          provider: row.provider,
          contentId: row.contentId,
          externalId: row.externalId,
          title: row.title,
          year: row.year,
          type: row.type,
          image: row.image,
          updatedAt: now,
          ttl: row.ttl,
        },
      });
    logger.debug(`Upserted provider_content ${row.id} ${row.title}`);
  } catch (e: any) {
    handleError(e, logger, `Failed to upsert provider_content ${row.title}`);
  }
}

export async function getProviderContentById(
  id: string,
): Promise<EProviderContent | undefined> {
  if (!db) return;
  const [row] = await db
    .select()
    .from(providerContent)
    .where(eq(providerContent.id, id))
    .limit(1);
  return row;
}

export async function getCountProviderContent() {
  if (!db) return;
  const number = await db
    .select({ count: count(providerContent.id) })
    .from(providerContent);
  return number;
}

// STREAMS
export async function upsertStream(
  streamRow: Omit<EStreamInsert, "createdAt">[],
) {
  if (!db) return;
  const now = Date.now();
  const rows = streamRow.map((r) => ({ ...r, createdAt: now }));
  try {
    await db
      .insert(stream)
      .values(rows)
      .onConflictDoUpdate({
        target: stream.hash,
        set: {
          providerContentId: sql.raw(
            `excluded.${stream.providerContentId.name}`,
          ),
          provider: sql.raw(`excluded.${stream.provider.name}`),
          externalId: sql.raw(`excluded.${stream.externalId.name}`),
          season: sql.raw(`excluded.${stream.season.name}`),
          episode: sql.raw(`excluded.${stream.episode.name}`),
          url: sql.raw(`excluded.${stream.url.name}`),
          hash: sql.raw(`excluded.${stream.hash.name}`),
          resolution: sql.raw(`excluded.${stream.resolution.name}`),
          size: sql.raw(`excluded.${stream.size.name}`),
          duration: sql.raw(`excluded.${stream.duration.name}`),
          ttl: sql.raw(`excluded.${stream.ttl.name}`),
        },
      });
    const row = rows[0];
    logger.debug(
      `Upserted streams ${row?.providerContentId}:${row?.season}:${row?.episode}`,
    );
  } catch (e) {
    const row = rows[0];
    handleError(
      e,
      logger,
      `Failed to upsert streams ${row?.providerContentId}:${row?.season}:${row?.episode}`,
    );
  }
}

export async function getStream(id: string) {
  if (!db) return;
  const [row] = await db.select().from(stream).where(eq(stream.id, id));
  return row;
}
export async function getStreamsJoinProvider(
  id: string,
  season: number,
  episode: number,
) {
  if (!db) return [];
  const seasonString = season.toString();
  const episodeString = episode.toString();
  const rows = await db
    .select()
    .from(stream)
    .innerJoin(
      providerContent,
      eq(stream.providerContentId, providerContent.id),
    )
    .where(
      and(
        eq(stream.providerContentId, id),
        eq(stream.season, seasonString),
        eq(stream.episode, episodeString),
      ),
    );
  return rows;
}
export async function getCountStream() {
  if (!db) return;
  const number = await db.select({ count: count(stream.id) }).from(stream);
  return number;
}

// SUBTITLES
export async function upsertSubtitles(
  subtitleRows: Omit<ESubtitleInsert, "createdAt">[],
) {
  if (!db) return;
  const now = Date.now();
  const rows = subtitleRows.map((subtitle) => ({
    id: subtitle.id,
    providerContentId: subtitle.providerContentId,
    url: subtitle.url,
    lang: subtitle.lang,
    season: subtitle.season,
    episode: subtitle.episode,
    subtitle: subtitle.subtitle,
    createdAt: now,
    ttl: subtitle.ttl,
  }));

  try {
    await db
      .insert(subtitle)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          subtitle.providerContentId,
          subtitle.season,
          subtitle.episode,
          subtitle.lang,
        ],
        set: {
          url: sql.raw(`excluded.${subtitle.url.name}`),
          subtitle: sql.raw(`excluded.${subtitle.subtitle.name}`),
          createdAt: sql.raw(`excluded.${subtitle.createdAt.name}`),
          ttl: sql.raw(`excluded.${subtitle.ttl.name}`),
        },
      });
    const row = rows[0];
    logger.debug(
      `Upserted subtitles ${row?.providerContentId}:${row?.season}:${row?.episode}`,
    );
  } catch (e) {
    const row = rows[0];
    handleError(
      e,
      logger,
      `Failed to upsert subtitles ${row?.providerContentId}:${row?.season}:${row?.episode}`,
    );
  }
}
export async function getSubtitle(id: string) {
  if (!db) return;
  const [row] = await db
    .select()
    .from(subtitle)
    .where(eq(subtitle.id, id))
    .limit(1);
  return row;
}
export async function getSubtitlesJoinProvider(
  id: string,
  season: number,
  episode: number,
) {
  if (!db) return;
  const row = await db
    .select()
    .from(subtitle)
    .innerJoin(
      providerContent,
      eq(subtitle.providerContentId, providerContent.id),
    )
    .where(
      and(
        eq(subtitle.providerContentId, id),
        eq(subtitle.season, season.toString()),
        eq(subtitle.episode, episode.toString()),
      ),
    );
  return row;
}
export async function getCountSubtitles() {
  if (!db) return;
  const number = await db.select({ count: count(subtitle.id) }).from(subtitle);
  return number;
}

// KV
export async function setKvs(kvs: EKVInsert[]) {
  if (!db) return;
  try {
    await db
      .insert(kv)
      .values(kvs)
      .onConflictDoUpdate({
        target: kv.key,
        set: {
          value: sql.raw(`excluded.${kv.value.name}`),
          size: sql.raw(`excluded.${kv.size.name}`),
          expiresAt: sql.raw(`excluded.${kv.expiresAt.name}`),
        },
      });
  } catch (e) {
    handleError(e, logger, `Failed to upsert kvs`);
  }
}

export async function cleanKv() {
  if (!db) return;
  await cleanKvLimit();
}
async function cleanKvLimit() {
  if (!db) return;

  const result = await db.delete(kv).where(lt(kv.expiresAt, Date.now()));
  console.log(`Cleaned ${result.rowCount} KV entries`);
}
