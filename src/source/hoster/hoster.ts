import { uuidv7 } from "uuidv7";
import { StreamInsert } from "../../db/schema/stream.js";
import { UserConfig } from "../../lib/manifest.js";
import { TTL_MS } from "../../utils/cache.js";
import { cleanUrl } from "../../utils/format.js";
import { Quality, toResolution } from "../../utils/info.js";
import { Logger } from "../../utils/logger.js";
import { getMediaflowproxyTranscodeUrl } from "../../utils/mediaflowproxy.js";
import { getTorboxStreamUrl } from "../debrid/torbox.js";
import { Provider } from "../provider.js";
import { GOFILE_HOST } from "./gofile.js";
import { MEGA_HOST } from "./mega.js";
import { getPixeldrainDownloadUrl, PIXELDRAIN_HOST } from "./pixeldrain.js";
import { getSendDownloadUrl, SEND_HOSTS } from "./send.js";

export interface EpisodeHoster {
  ep: number;
  data: {
    hoster: Hoster;
    size: string;
  }[];
}

const logger = new Logger("HOSTER");
export const enum Hoster {
  PIXELDRAIN = "pixeldrain",
  GOFILE = "gofile",
  SEND = "send",
  MEGA = "mega",
}

export function filterHosterUrlsFromUrls(urls: string[]) {
  let pixeldrainUrls: string[] = [];
  let gofileUrls: string[] = [];
  let sendUrls: string[] = [];
  let megaUrls: string[] = [];
  urls.forEach((url) => {
    switch (true) {
      case url.includes(PIXELDRAIN_HOST):
        pixeldrainUrls.push(cleanUrl(url));
        break;
      case url.includes(GOFILE_HOST):
        gofileUrls.push(cleanUrl(url));
        break;
      case url.includes(MEGA_HOST):
        megaUrls.push(cleanUrl(url));
        break;
      case SEND_HOSTS.some((host) => url.includes(host)):
        sendUrls.push(cleanUrl(url));
        break;
      default:
        break;
    }
  });
  logger.log(`PIXELDRAIN ${pixeldrainUrls.length}`);
  logger.log(`GOFILE ${gofileUrls.length}`);
  logger.log(`SEND ${sendUrls.length}`);
  logger.log(`MEGA ${megaUrls.length}`);
  return { pixeldrainUrls, gofileUrls, sendUrls, megaUrls };
}

export function hosterToStream(
  urls: string[],
  episodes: EpisodeHoster[],
  quality: Quality,
  providerContentId: string,
  provider: Provider,
  externalId: string,
  season: string,
) {
  const { pixeldrainUrls, gofileUrls, sendUrls, megaUrls } =
    filterHosterUrlsFromUrls(urls.flat());
  const streamRows = episodes
    .map((episode) => {
      const streamEpisodeRows = episode.data.map((hosterData) => {
        const hoster = hosterData.hoster;
        let url = "";
        switch (hoster) {
          case Hoster.PIXELDRAIN:
            url = pixeldrainUrls.shift()!;
            break;
          case Hoster.GOFILE:
            url = gofileUrls.shift()!;
            break;
          case Hoster.SEND:
            url = sendUrls.shift()!;
            break;
          case Hoster.MEGA:
            url = megaUrls.shift()!;
            break;
          default:
            break;
        }
        const size = hosterData.size.toString();
        const streamResolution = toResolution(quality);
        const resolution = `${streamResolution.width}x${streamResolution.height}`;
        const streamRow: StreamInsert = {
          id: uuidv7(),
          providerContentId,
          provider,
          externalId,
          resolution: resolution,
          size,
          season,
          episode: episode.ep.toString(),
          url,
          ttl: TTL_MS.stream,
        };
        return streamRow;
      });
      return streamEpisodeRows;
    })
    .flat();
  return streamRows;
}

export function getHosterFromUrl(url: string) {
  switch (true) {
    case url.includes(PIXELDRAIN_HOST):
      return Hoster.PIXELDRAIN;
    case url.includes(GOFILE_HOST):
      return Hoster.GOFILE;
    case url.includes(MEGA_HOST):
      return Hoster.MEGA;
    case SEND_HOSTS.some((host) => url.includes(host)):
      return Hoster.SEND;
    default:
      return null;
  }
}

export async function getHosterDownloadUrl(url: string, config: UserConfig) {
  const hoster = getHosterFromUrl(url);
  if (hoster && config.tbKey) {
    return (await getTorboxStreamUrl(url, config)) || "";
  }
  switch (hoster) {
    case Hoster.PIXELDRAIN:
      return getPixeldrainDownloadUrl(url);
    case Hoster.SEND:
      if (config.mfpUrl) {
        const streamUrl = await getSendDownloadUrl(url, config);
        return getMediaflowproxyTranscodeUrl(streamUrl, config);
      }
      return "";
    case Hoster.GOFILE:
      return "";
    case Hoster.MEGA:
      return "";
    default:
      return url;
  }
}

export function isHosterUrl(url: string) {
  const hoster = getHosterFromUrl(url);
  if (hoster) {
    return true;
  }
  return false;
}
