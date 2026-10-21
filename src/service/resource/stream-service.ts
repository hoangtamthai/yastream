import { Stream } from "@stremio-addon/sdk";
import {
  deleteStream,
  getCountStream,
  getStream,
  getStreamsJoinProvider,
  upsertStream,
} from "../../db/queries.js";
import { UserConfig } from "../../lib/manifest.js";
import { getCachedMap } from "../../source/debrid/torbox.js";
import {
  getHosterDownloadUrl,
  getHosterFromUrl,
  isHosterUrl,
} from "../../source/hoster/hoster.js";
import { API, STREAMS, TICKCOUNTER_HOST } from "../../utils/constant.js";
import { getOrigin } from "../../utils/domain.js";
import { extractSeason, formatStreamTitle } from "../../utils/format.js";
import {
  checkWorkingStream,
  parseInfo,
  probeStreamInfo,
} from "../../utils/info.js";
import { matchesHost } from "../../utils/url-validation.js";
import RedirectService from "../redirect/redirect-service.js";

class StreamService {
  static async getStream(id: string) {
    return getStream(id);
  }

  static async getDbStreams(
    id: string,
    season: number,
    episode: number,
    displayName: string,
    config: UserConfig,
  ): Promise<Stream[]> {
    const streamsAndProvider = await getStreamsJoinProvider(
      id,
      season ?? 1,
      episode ?? 1,
    );
    if (streamsAndProvider && streamsAndProvider.length > 0) {
      // Check TB cache and make a map of url -> {cached: boolean}
      const urls = streamsAndProvider
        .filter((stream) => isHosterUrl(stream.stream.url))
        .map((stream) => stream.stream.url);
      const cachedMap = getCachedMap(urls, config);
      const streams = await Promise.all(
        streamsAndProvider.map(async (stream, index) => {
          let url = stream.stream.url;
          if (matchesHost(url, TICKCOUNTER_HOST)) {
            return;
          }
          const ttl = stream.stream.ttl ?? 0;
          const updatedAt = stream.stream.updatedAt;
          const isExpired = updatedAt.getTime() + ttl < Date.now();
          const provider = stream.provider_content.provider;
          let info = parseInfo(stream.stream);
          if (isExpired && !isHosterUrl(url)) {
            const probeInfo = await probeStreamInfo(url);
            info = probeInfo || info;
            const workingStream = checkWorkingStream(probeInfo);
            if (!workingStream) {
              deleteStream(stream.stream.id);
              return;
            }
            if (info?.resolution) {
              stream.stream.resolution = `${info.resolution.width}x${info.resolution.height}`;
            }
            if (info?.size)
              stream.stream.size = info.size.toFixed(2).toString();
            if (info?.hours && info?.minutes) {
              stream.stream.duration = (
                info.hours * 60 +
                info.minutes
              ).toString();
            }
            // Extend ttl by double if link still working
            stream.stream.ttl = ttl
              ? Math.min(ttl * 2, Number.MAX_SAFE_INTEGER)
              : ttl;
            upsertStream([{ ...stream.stream }]);
          }
          season = extractSeason(stream.provider_content.title).season ?? 1;
          const description = formatStreamTitle(
            stream.provider_content.title,
            stream.provider_content.year,
            season,
            episode,
            info,
          );
          const hoster = getHosterFromUrl(url);
          let name = displayName;
          let fileHoster = "";
          if (hoster) {
            name = `${displayName}\n${hoster}`;
            fileHoster = hoster;
          }
          let filename = `${description}-${provider}`;
          const isCached = (await cachedMap).get(url);
          if (isCached !== undefined) {
            if (isCached) {
              name = `[TB+] ${name}`;
              filename = `${description}-cached-${fileHoster}(${provider})`;
            } else {
              name = `[TB] ${name}`;
              filename = `${description}-uncached-${fileHoster}(${provider})`;
            }
            url = RedirectService.getHosterRedirectApiUrl(url, config);
          } else {
            // not have TB key
            url = await getHosterDownloadUrl(url, config);
          }
          const bingeGroup = `${name}-${index}`;
          // if can't get stream url, not show, only when has TB API KEY will add more for other hoster
          if (url === "") return;
          return {
            url,
            name,
            description,
            behaviorHints: {
              notWebReady: true,
              bingeGroup,
              filename,
            },
          };
        }),
      );
      return streams.filter((stream) => stream !== undefined);
    }
    return [];
  }

  static getStreamUrl(id: string) {
    return `${getOrigin()}/${API}/${STREAMS}/${id}.m3u8`;
  }

  static async getTotalStreams() {
    const streams = await getCountStream();
    if (!streams) return 0;
    const total = Number(streams[0]?.count ?? 0);
    return total;
  }
}

export default StreamService;
