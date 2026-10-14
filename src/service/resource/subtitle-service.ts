import { Subtitle } from "@stremio-addon/sdk";
import {
  deleteSubtitle,
  getCountSubtitles,
  getSubtitle,
  getSubtitlesJoinProvider,
  upsertSubtitles,
} from "../../db/queries.js";
import { axiosGet } from "../../utils/axios.js";
import { cache } from "../../utils/cache.js";
import { API, SUBTITLES } from "../../utils/constant.js";
import { getOrigin } from "../../utils/domain.js";
import { getWebshareProxyConfig } from "../../utils/proxy/webshare.js";

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
      const subtitles = await Promise.all(
        subtitlesAndProvider.map(async (subtitle) => {
          let url = subtitle.subtitle.url;
          const ttl = subtitle.subtitle.ttl ?? 0;
          if (subtitle.subtitle.subtitle) {
            url = SubtitleService.getSubtitleUrl(subtitle.subtitle.id);
          }
          const isExpired =
            subtitle.subtitle.updatedAt.getTime() + ttl < Date.now();
          if (isExpired) {
            const subtitleContent = await axiosGet<String>(
              url,
              getWebshareProxyConfig(),
            );
            if (!subtitleContent) {
              deleteSubtitle(subtitle.subtitle.id);
              return;
            }
            subtitle.subtitle.ttl = Math.min(ttl * 2, Number.MAX_SAFE_INTEGER);
            upsertSubtitles([subtitle.subtitle]);
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
}
export default SubtitleService;
