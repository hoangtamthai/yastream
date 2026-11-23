import { Prefix, UserConfig } from "../lib/manifest.js";
import { ContentDetail } from "../source/meta.js";

/**
 * Id to show for a catalog item.
 *
 * An IMDb match always wins (existing behavior). With the opt-in `tmdbId`
 * setting, an item that only matched TMDB gets `tmdb:<id>` instead of its
 * provider id, so metadata/poster addons that key on TMDB (e.g. AIOMetadata)
 * can enrich it. Off by default: plain Stremio has no meta addon for `tmdb:`.
 */
export function catalogMetaId(
  providerId: string,
  tmdbDetail: Pick<ContentDetail, "id" | "imdbId"> | null | undefined,
  config: Pick<UserConfig, "tmdbId">,
): string {
  if (!tmdbDetail) return providerId;
  if (tmdbDetail.imdbId) return tmdbDetail.imdbId;
  if (config.tmdbId && tmdbDetail.id) return `${Prefix.TMDB}:${tmdbDetail.id}`;
  return providerId;
}
