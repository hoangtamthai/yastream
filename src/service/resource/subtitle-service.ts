import { Subtitle } from "@stremio-addon/sdk";
import {
  deleteSubtitle,
  getCountSubtitles,
  getSubtitle,
  getSubtitlesJoinProvider,
  upsertSubtitles,
} from "../../db/queries.js";
import { SubtitleInsert } from "../../db/schema/subtitle.js";
import { cache, TTL_MS } from "../../utils/cache.js";
import { API, SUBTITLES } from "../../utils/constant.js";
import { getOrigin } from "../../utils/domain.js";

class SubtitleService {
  static async getSubtitle(id: string) {
    const subtitle = await getSubtitle(id);
    if (!subtitle) return undefined;
    const cacheKey = `subtitle:service:${subtitle.id}`;
    const cacheResult = await cache.get(cacheKey);
    if (cacheResult) return cacheResult;
    return subtitle;
  }

  // Select only subtitles that are not expired
  static async getSubtitlesFromDb(
    id: string,
    season: number,
    episode: number,
    checkTTL = true,
  ): Promise<Subtitle[]> {
    const subtitlesAndProvider = await getSubtitlesJoinProvider(
      id,
      season ?? 1,
      episode ?? 1,
    );
    if (subtitlesAndProvider && subtitlesAndProvider.length > 0) {
      const subtitles = await Promise.all(
        subtitlesAndProvider.map(async (subtitle) => {
          let url = subtitle.subtitle.url;
          const ttl = subtitle.subtitle.ttl ?? 0;
          if (subtitle.subtitle.subtitle) {
            url = SubtitleService.getSubtitleUrl(subtitle.subtitle.id);
          }
          const isExpired =
            subtitle.subtitle.updatedAt.getTime() + ttl < Date.now();
          if (checkTTL && isExpired) {
            return;
          }
          return {
            id: id,
            label: subtitle.provider_content.provider,
            lang: subtitle.subtitle.lang,
            url: url,
          };
        }),
      );
      return subtitles.filter((subtitle) => subtitle !== undefined);
    }
    return [];
  }

  static getSubtitleUrl(id: string) {
    return `${getOrigin()}/${API}/${SUBTITLES}/${id}.vtt`;
  }

  static async getTotalSubtitles() {
    const subtitles = await getCountSubtitles();
    if (!subtitles) return 0;
    const total = Number(subtitles[0]?.count ?? 0);
    return total;
  }

  static async syncSubtitles(
    newSubtitles: SubtitleInsert[],
    name: string,
    id: string,
    episode?: number,
  ) {
    // Process each new subtitle: check URL match with saved subtitles
    const savedSubtitles = await SubtitleService.getSubtitlesFromDb(
      `${name}:${id}`,
      1,
      episode ?? 1,
      false,
    );
    const processedSubtitleRows = await Promise.all(
      newSubtitles.map(async (row) => {
        // Find matching saved subtitle by URL
        const matchingSaved = savedSubtitles.find((s) => s.lang === row.lang);
        if (!matchingSaved) {
          return row;
        } else if (matchingSaved.url === row.url) {
          // URL matches - double the TTL and update the record
          row.ttl = TTL_MS.stream * 2;
          row.id = matchingSaved.id;
        } else {
          // URL doesn't match - remove the old subtitle from DB
          deleteSubtitle(matchingSaved.id);
        }
        return row;
      }),
    );
    upsertSubtitles(processedSubtitleRows);
  }
}
export default SubtitleService;
