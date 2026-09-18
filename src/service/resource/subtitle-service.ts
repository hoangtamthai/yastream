import { Subtitle } from "@stremio-addon/sdk";
import {
  getCountSubtitles,
  getSubtitle,
  getSubtitlesJoinProvider,
} from "../../db/queries.js";
import { API, SUBTITLES } from "../../utils/constant.js";
import { getOrigin } from "../../utils/domain.js";
import { cache } from "../../utils/cache.js";
import { ONETOUCHTV_HOST } from "../../source/onetouchtv.js";

class SubtitleService {
  static async getSubtitle(id: string) {
    const subtitle = await getSubtitle(id);
    if (!subtitle) return undefined;
    const cacheKey = `subtitle:service:${subtitle.id}`;
    const cacheResult = await cache.get(cacheKey);
    if (cacheResult) return cacheResult;
    return subtitle;
  }
  static async getSubtitlesFromDb(
    id: string,
    season: number,
    episode: number,
  ): Promise<Subtitle[]> {
    const subtitlesAndProvider = await getSubtitlesJoinProvider(
      id,
      season ?? 1,
      episode ?? 1,
    );
    if (subtitlesAndProvider && subtitlesAndProvider.length > 0) {
      const subtitles = subtitlesAndProvider.map((subtitle) => {
        let url = subtitle.subtitle.url;
        if (subtitle.subtitle.subtitle) {
          url = SubtitleService.getSubtitleUrl(subtitle.subtitle.id);
        }
        const isExpired =
          subtitle.subtitle.createdAt + (subtitle.subtitle.ttl ?? 0) <
          Date.now();
        if (isExpired) {
          return;
        }
        return {
          id: id,
          label: subtitle.provider_content.provider,
          lang: subtitle.subtitle.lang,
          url: url,
        };
      });
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
}
export default SubtitleService;
