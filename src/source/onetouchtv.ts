import {
  CatalogHandlerArgs,
  ContentType,
  MetaDetail,
  MetaPreview,
  MetaVideo,
  Stream,
  Subtitle,
} from "@stremio-addon/sdk";
import { uuidv7 } from "uuidv7";
import {
  getContentByTmdb,
  getProviderContentById,
  upsertContent,
  upsertProviderContent,
  upsertStream,
  upsertSubtitles,
} from "../db/queries.js";
import { EContent } from "../db/schema/content.js";
import { EProviderContentInsert } from "../db/schema/provider_content.js";
import { StreamInsert } from "../db/schema/stream.js";
import { SubtitleInsert } from "../db/schema/subtitle.js";
import { Prefix, UserConfig } from "../lib/manifest.js";
import ProviderService from "../service/provider/provider-service.js";
import StreamService from "../service/resource/stream-service.js";
import SubtitleService from "../service/resource/subtitle-service.js";
import { axiosGet } from "../utils/axios.js";
import { cache, TTL_MS } from "../utils/cache.js";
import { hashSHA256 } from "../utils/crypto.js";
import {
  handleError,
  MatchingError,
  OnetouchDetailError,
  OnetouchEpisodeError,
  OnetouchSearchError,
} from "../utils/error.js";
import { cleanUrl, extractTitle, formatStreamTitle } from "../utils/format.js";
import { matchTitle } from "../utils/fuse.js";
import { probeStreamInfo } from "../utils/info.js";
import { CountryCode, iso639FromCountryCode } from "../utils/language.js";
import { ContentDetail } from "./meta.js";
import { getPosterUrl, PosterParam } from "./poster/poster.js";
import { BaseProvider } from "./provider.js";
import { tmdb } from "./tmdb.js";

interface OnetouchtvTop {
  result: {
    day: OnetouchtvPreview[];
    week: OnetouchtvPreview[];
    month: OnetouchtvPreview[];
  };
}
interface OnetouchtvHome {
  result: {
    recents: OnetouchtvPreview[];
    randomSlideShow: OnetouchtvPreview[];
  };
}
interface OnetouchtvSearch {
  result: OnetouchtvPreview[];
}

interface OnetouchtvPreview {
  id: string;
  title: string;
  year: string;
  description: string;
  country: string;
  genres: string[];
  image: string;
  otherTitles: string[];
}

interface OnetouchtvDetail {
  result: {
    id: string;
    episode: string;
    title: string;
    otherTitles: string[];
    year: string;
    description: string;
    genres: string[];
    image: string;
    episodes: OnetouchtvEpisodePreview[];
  };
}
interface OnetouchtvEpisodePreview {
  episode: string;
  identifier: string;
  playId: string;
  id: string;
  isSub: boolean;
}
interface OnetouchtvSource {
  type: string;
  headers: Record<string, string>;
  contentId: string;
  id: string;
  name: string;
  quality: string;
  url: string;
}
interface OnetouchtvEpisode {
  result: {
    sources: OnetouchtvSource[];
    track: OnetouchtvSubtitle[];
  };
}
interface OnetouchtvSubtitle {
  file: string;
  label: string;
  name: string;
}

const ONETOUCHTV_CATALOG: Record<string, string> = {
  Popular: "popular",
  Chinese: "chinese",
  Korean: "korean",
  Thai: "thai",
};

const ONETOUCHTV_LANGUAGE: Record<string, CountryCode> = {
  English: CountryCode.en,
  Türk: CountryCode.tr,
  Española: CountryCode.es,
  中文: CountryCode.zh,
  繁体中文: CountryCode.zh,
  Arabic: CountryCode.ar,
  Hindi: CountryCode.hi,
  "Tiếng Việt": CountryCode.vi,
  Deutsch: CountryCode.de,
  Français: CountryCode.fr,
  Indonesia: CountryCode.id,
  Italian: CountryCode.it,
  اُردُو: CountryCode.ur,
  日本語: CountryCode.ja,
  한국어: CountryCode.ko,
  Português: CountryCode.pt,
  ខ្មែរ: CountryCode.km,
  "По-русски": CountryCode.ru,
  Melayu: CountryCode.ms,
  ภาษาไทย: CountryCode.th,
  Русский: CountryCode.ru,
  မြန်မာ: CountryCode.ms,
  Burmese: CountryCode.ms,
  Myanmar: CountryCode.ms,
  Filipino: CountryCode.tl,
  বাংলা: CountryCode.bn,
  ਪੰਜਾਬੀ: CountryCode.pa,
};
export const ONETOUCHTV_HOST = Buffer.from(
  "YWFwYW5lbC5kZXZjb3JwLm1l",
  "base64",
).toString("utf-8");

export class OnetouchtvScrapper extends BaseProvider {
  supportedPrefix: Prefix[] = [
    Prefix.IMDB,
    Prefix.TMDB,
    Prefix.TVDB,
    Prefix.KISSKH,
    Prefix.ONETOUCHTV,
  ];
  baseUrl = Buffer.from("aHR0cHM6Ly9hcGkzLmRldmNvcnAubWU=", "base64").toString(
    "utf-8",
  );
  private onetouchTmdb = new Map([["172390-climax-2026", "241860"]]);

  async searchCatalog(
    args: CatalogHandlerArgs,
    config: UserConfig,
  ): Promise<MetaPreview[]> {
    const { id, type, extra } = args;
    const search = extra.search!;
    const searchResults = await this.searchTitle(
      search,
      undefined,
      undefined,
      false,
    );
    const tmdbDetails = await Promise.all(
      searchResults.result.map((item) => {
        const { title, year } = extractTitle(item.title);
        return tmdb.searchDetail(title, type, year);
      }),
    );
    const posterResults = await Promise.all(
      searchResults.result.map(async (item, index) => {
        const tmdbDetail = tmdbDetails[index];
        let poster = item.image;
        // Use TMDB/RPDB if available
        if (tmdbDetail) {
          const sameTitleId = this.onetouchTmdb.get(item.id);
          if (sameTitleId) {
            tmdbDetail.id = sameTitleId;
          }
          const posterParam: PosterParam = {
            prefix: Prefix.TMDB,
            id: tmdbDetail.id,
            type,
            fallbackUrl: tmdbDetail.thumbnail || poster,
          };
          if (tmdbDetail.imdbId) {
            posterParam.prefix = Prefix.IMDB;
            posterParam.id = tmdbDetail.imdbId;
          }
          poster = await getPosterUrl(posterParam, config);
        }
        item.image = poster;
        return item;
      }),
    );
    const searches: MetaPreview[] = posterResults.map((item) => ({
      id: `${Prefix.ONETOUCHTV}:${item.id}`,
      name: item.title,
      poster: item.image,
      type: type,
    }));

    return searches;
  }

  async getCatalog(
    args: CatalogHandlerArgs,
    config: UserConfig,
  ): Promise<MetaPreview[]> {
    try {
      const { id, type, extra } = args;
      const skip = extra.skip;
      const [prefix, typeParam, name] = id.split(".");
      const pageSize = 10;
      let page = this.getPage(pageSize, skip);
      const catalogType = ONETOUCHTV_CATALOG[name || "Popular"];
      //   const url =
      //     type === "movie"
      //       ? `${this.baseUrl}/vod/movie?page=${page}`
      //       : `${this.baseUrl}/vod/popular?page=${page}`;
      let filteredData: OnetouchtvPreview[] = [];
      if (catalogType === ONETOUCHTV_CATALOG["Popular"]) {
        const topUrl = `${this.baseUrl}/vod/top`;
        this.logger.log(`GET catalog | ${topUrl}`);
        const data = await axiosGet<OnetouchtvTop>(topUrl);
        if (!data) return [];
        // const data: OnetouchtvTop = decryptString(encryptedData);
        filteredData = data.result.day;
      } else {
        const url = `${this.baseUrl}/vod/home`;
        this.logger.log(`GET catalog | ${url}`);
        const data = await axiosGet<OnetouchtvHome>(url);
        if (!data) return [];
        // const data: OnetouchtvHome = decryptString(encryptedData);
        filteredData = data.result.recents.filter(
          (item) => item.country === catalogType,
        );
      }
      const tmdbDetails = await Promise.all(
        filteredData.map((item) => {
          const { title, year } = extractTitle(item.title);
          return tmdb.searchDetail(title, type, year);
        }),
      );
      const metas = await Promise.all(
        filteredData.map(async (item, index) => {
          const onetouchtvId = `${Prefix.ONETOUCHTV}:${item.id}`;
          const metaDetail: MetaDetail = {
            id: onetouchtvId,
            name: item.title,
            poster: item.image,
            background: item.image,
            type: type,
          };
          const tmdbDetail = tmdbDetails[index];
          let poster = item.image;
          // Use TMDB/RPDB if available
          const providerContent: Omit<
            EProviderContentInsert,
            "createdAt" | "updatedAt"
          > = {
            id: onetouchtvId,
            contentId: null,
            title: item.title,
            ttl: TTL_MS.provider,
            provider: this.name,
            externalId: item.id,
            image: item.image,
            year: parseInt(item.year),
            type: type,
          };
          if (tmdbDetail) {
            const sameTitleId = this.onetouchTmdb.get(item.id);
            if (sameTitleId) {
              tmdbDetail.id = sameTitleId;
            }
            const posterParam: PosterParam = {
              prefix: Prefix.TMDB,
              id: tmdbDetail.id,
              type,
              fallbackUrl: tmdbDetail.thumbnail || poster,
            };
            if (tmdbDetail.imdbId) {
              posterParam.prefix = Prefix.IMDB;
              posterParam.id = tmdbDetail.imdbId;
            }
            poster = await getPosterUrl(posterParam, config);
            // Save content to DB
            const existingContent = await getContentByTmdb(tmdbDetail.id, type);
            let contentId: string = uuidv7();
            if (existingContent) {
              contentId = existingContent.id;
            } else {
              await upsertContent(contentId, tmdbDetail, TTL_MS.content);
              upsertProviderContent({
                ...providerContent,
                contentId: contentId,
                title: item.title,
              });
            }
          } else {
            // not found tmdb
            upsertProviderContent(providerContent);
          }
          metaDetail.poster = poster;
          if (type === "movie") {
            metaDetail.behaviorHints = {
              defaultVideoId: `${onetouchtvId}:1:1`,
            };
            return metaDetail;
          }
          return metaDetail;
        }),
      );
      return metas;
    } catch (error) {
      handleError(error, this.logger, `Failed to get catalog ${args.id}`);
      return [];
    }
  }

  async getMeta(
    content: ContentDetail,
    type: ContentType,
  ): Promise<MetaDetail | null> {
    try {
      const { id, season, episode } = content;
      const detail = (await this.getDetail(id)).result;
      if (!detail) return null;
      const releaseDate =
        new Date(detail.year).toISOString() || new Date().toISOString();
      let year = new Date(releaseDate).getFullYear();
      const tmdbDetail = await tmdb.searchDetail(detail.title, type);
      let oldContent: EContent | undefined = undefined;
      if (tmdbDetail) {
        detail.description = tmdbDetail.overview || detail.description;
        year = tmdbDetail.year;
        oldContent = await getContentByTmdb(tmdbDetail.id, type);
        if (oldContent) {
          upsertContent(oldContent.id, tmdbDetail, TTL_MS.content);
        }
      }
      const background = tmdbDetail?.background || detail.image;
      const image = detail.image?.replace(
        "image-7wk.pages.dev",
        "image-v1.pages.dev",
      );
      const videos: MetaVideo[] = detail.episodes.map((ep) => {
        const video = {
          id: `${Prefix.ONETOUCHTV}:${id}:${season}:${ep.episode}`,
          title: detail.title,
          released: releaseDate,
          season: 1,
          episode: parseInt(ep.episode),
          thumbnail: image,
          background: background,
        };
        return video;
      });
      let metaId = id;
      const meta: MetaDetail = {
        id: metaId,
        type: type,
        name: detail.title,
        poster: image,
        background: background,
        description: detail.description,
        released: releaseDate,
        genres: detail.genres,
        videos: videos,
      };
      const existingContent = await getProviderContentById(metaId);
      const contentId = oldContent ? oldContent.id : null;
      if (existingContent && oldContent) {
        await upsertProviderContent({
          ...existingContent,
          contentId: contentId,
          title: detail.title,
          image: detail.image,
          year: year,
          ttl: null,
        });
      } else {
        await upsertProviderContent({
          id: metaId,
          contentId: contentId,
          title: detail.title,
          ttl: null,
          provider: this.name,
          externalId: detail.id,
          image: detail.image,
          year: year,
          type: type,
        });
      }
      return meta;
    } catch (error) {
      handleError(
        error,
        this.logger,
        `Failed to get meta for ${content.title}`,
      );
      return null;
    }
  }

  async getStreams(
    content: ContentDetail,
    config: UserConfig,
  ): Promise<Stream[]> {
    this.logger.log(`Stream | ${content.title} ${content.id}`);
    try {
      const { title, type, year, season, episode, id } = content;
      let onetouchtvId = content.onetouchtvId;
      const streamKey = `streams:${type}:${this.name}:${id}:${season}:${episode}:${config.info}`;
      const cacheStreams = cache.get(streamKey);
      // Cached streams
      if (cacheStreams) return cacheStreams;
      // Db streams
      const dbStreams = await StreamService.getDbStreams(
        `${this.name}:${onetouchtvId}`,
        // season ?? 1,
        1,
        episode ?? 1,
        this.displayName,
        config,
      );
      if (dbStreams.length > 0) {
        cache.set(streamKey, dbStreams, TTL_MS.stream);
        return dbStreams;
      }
      let detail = null;
      if (onetouchtvId) {
        detail = await this.getDetail(onetouchtvId);
      } else {
        const search = await this.searchTitle(title, year, season);
        const searchResult = search.result[0];
        if (!searchResult) return [];
        detail = await this.getDetail(searchResult.id);
        onetouchtvId = searchResult.id;
      }
      if (!detail) return [];
      await ProviderService.syncContentAndProvider(
        content,
        onetouchtvId.toString(),
        this.name,
      );
      // const tmdbDetail = await tmdb.searchDetail(content.title, type);
      // if (tmdbDetail) {
      //   const oldContent = await getContentByTmdb(tmdbDetail.id, type);
      //   if (oldContent) {
      //     const contentId = oldContent.id;
      //     upsertContent(contentId, tmdbDetail, TTL_MS.content);
      //     const providerContent = await getProviderContentById(
      //       `${Prefix.ONETOUCHTV}:${detail.result.id}`,
      //     );
      //     if (providerContent) {
      //       upsertProviderContent({
      //         ...providerContent,
      //         title: detail.result.title,
      //         contentId: contentId,
      //         image: detail.result.image,
      //         year: year,
      //         ttl: null,
      //       });
      //     } else {
      //       upsertProviderContent({
      //         id: `${Prefix.ONETOUCHTV}:${onetouchtvId}`,
      //         externalId: detail.result.id,
      //         title: detail.result.title,
      //         provider: this.name,
      //         type: type,
      //         contentId: contentId,
      //         image: detail.result.image,
      //         year: year,
      //         ttl: null,
      //       });
      //     }
      //   }
      // }
      const identifier = detail.result.episodes[0]?.identifier;
      const episodeId = identifier || detail.result.id;
      const episodeData = detail.result.episodes.find(
        (ep) => ep.episode == episode?.toString(),
      );
      if (!episodeData) return [];
      const episodeParam = episodeData?.playId || episode?.toString() || "1";
      const episodeDetail = await this.getEpisode(episodeId, episodeParam);
      const streamRows: StreamInsert[] = [];
      const streams = await Promise.all(
        episodeDetail.result.sources.map(async (source, index) => {
          const { playlist, url } = await this.getFinalPlaylist(source.url);
          const info = config.info ? await probeStreamInfo(url) : undefined;
          const formatTitle = formatStreamTitle(
            detail.result.title,
            year,
            season,
            episode,
            info,
          );
          const stream: Stream = {
            url: url,
            name: this.displayName,
            description: formatTitle,
            behaviorHints: {
              notWebReady: true,
              bingeGroup: `${this.displayName}-${index}`,
              filename: `${formatTitle}-${this.name}`,
            },
          };
          // Save stream to db
          const streamRow: StreamInsert = {
            id: uuidv7(),
            providerContentId: `${this.name}:${detail.result.id}`,
            provider: this.name,
            externalId: episodeId.toString(),
            // season: season?.toString() ?? "1",
            season: "1",
            episode: episode?.toString() ?? "1",
            url: cleanUrl(source.url),
            ttl: TTL_MS.stream,
          };
          if (info?.resolution) {
            streamRow.resolution = `${info.resolution.width}x${info.resolution.height}`;
          }
          if (info?.size) streamRow.size = info.size.toFixed(2).toString();
          if (info?.hours && info?.minutes) {
            streamRow.duration = (info.hours * 60 + info.minutes).toString();
          }
          if (playlist) {
            // streamRow.playlist = playlist;
            streamRow.hash = hashSHA256(playlist);
          }
          streamRows.push(streamRow);
          return stream;
        }),
      );
      if (streams.length > 0) {
        cache.set(streamKey, streams, TTL_MS.stream);
        upsertStream(streamRows);
      }
      return streams;
    } catch (error) {
      handleError(error, this.logger, `Fail to get streams ${content.title}`);
      return [];
    }
  }

  async getFinalPlaylist(
    url: string,
  ): Promise<{ playlist: string | null; url: string }> {
    if (url.includes("m3u8")) {
      let playlistUrl = url;
      let playlist: string | null = null;
      let attempts = 0;
      const maxAttempts = 2;
      while (attempts < maxAttempts) {
        this.logger.log(`GET playlist | ${playlistUrl}`);
        playlist = await axiosGet<string>(playlistUrl);
        if (!playlist) break;
        if (!playlist.includes(ONETOUCHTV_HOST)) {
          break;
        }
        // Parse last EXT-X-STREAM-INF URL
        const lines = playlist.split("\n");
        let lastStreamUrl: string | null = null;
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i]?.trim();
          if (line && !line.startsWith("#")) {
            lastStreamUrl = line;
            break;
          }
        }
        if (!lastStreamUrl) break;
        this.logger.log(`Playlist redirected to ${lastStreamUrl}`);
        playlistUrl = lastStreamUrl;
        attempts++;
      }
      if (playlist) {
        return { playlist: playlist, url: playlistUrl };
      }
    }
    return { playlist: null, url: url };
  }

  async getSubtitles(content: ContentDetail): Promise<Subtitle[]> {
    const { title, type, year, season, episode, id } = content;
    let onetouchtvId = content.onetouchtvId;
    const subtitleKey = `subtitles:${type}:${this.name}:${id}:${season}:${episode}`;
    const cachedSubtitles = cache.get(subtitleKey);
    if (cachedSubtitles) return cachedSubtitles;
    const savedSubtitles = await SubtitleService.getSubtitlesFromDb(
      `${this.name}:${onetouchtvId}`,
      // content.season ?? 1,
      1,
      content.episode ?? 1,
    );
    if (savedSubtitles.length > 0) {
      cache.set(subtitleKey, savedSubtitles, TTL_MS.stream);
      return savedSubtitles;
    }
    if (!onetouchtvId) {
      const search = await this.searchTitle(title, year, season);
      const searchResult = search.result[0];
      if (!searchResult) return [];
      onetouchtvId = searchResult.id;
    }
    const detail = await this.getDetail(onetouchtvId);
    const episodeId = detail.result.episodes[0]?.identifier || detail.result.id;
    const episodeData = detail.result.episodes.find(
      (ep) => ep.episode == episode?.toString(),
    );
    const episodeParam = episodeData?.playId || episode?.toString() || "1";
    const episodeDetail = await this.getEpisode(episodeId, episodeParam);
    const subtitles = episodeDetail.result.track.map((source, index) => {
      const countryCode: CountryCode =
        ONETOUCHTV_LANGUAGE[source.name] || CountryCode.multi;
      const iso = iso639FromCountryCode(countryCode);
      const subtitle: Subtitle = {
        id: `${this.name}-${iso}-${index}`,
        url: source.file,
        lang: iso,
        label: `${this.name}`,
      };
      return subtitle;
    });
    if (subtitles.length > 0) {
      cache.set(subtitleKey, subtitles, 4 * 60 * 60 * 1000);
      const subtitleRows = await Promise.all(
        subtitles.map(async (subtitle) => {
          const subtitleRow: SubtitleInsert = {
            ...subtitle,
            id: uuidv7(),
            season: "1",
            episode: episode?.toString() ?? "1",
            providerContentId: `${this.name}:${onetouchtvId}`,
            // subtitle: subtitleContent,
            ttl: TTL_MS.stream,
          };
          return subtitleRow;
        }),
      );
      const uniqueSubtitleRows = this._toUniqueSubtitles(subtitleRows);
      upsertSubtitles(uniqueSubtitleRows);
    }
    return subtitles;
  }

  _toUniqueSubtitles(subtitles: SubtitleInsert[]) {
    const uniqueSubtitles = subtitles.filter(
      (subtitle, index, self) =>
        index ===
        self.findIndex(
          (s) =>
            s.providerContentId === subtitle.providerContentId &&
            s.season === subtitle.season &&
            s.episode === subtitle.episode &&
            s.lang === subtitle.lang,
        ),
    );
    return uniqueSubtitles;
  }

  async searchTitle(
    title: string,
    year?: number,
    season?: number,
    isFilter = true,
  ): Promise<OnetouchtvSearch> {
    const url = `${this.baseUrl}/vod/search?page=1&keyword=${title}`;
    this.logger.log(`GET search | ${url}`);
    const data = await axiosGet<OnetouchtvSearch>(url);
    if (!data) throw new OnetouchSearchError("Failed to get search results");
    // const data: OnetouchtvSearch = decryptString(encryptedData);
    const result = data.result;
    const details = isFilter ? matchTitle(result, title, year, season) : result;
    if (!details[0]) throw new MatchingError("No matching search results");
    return { result: details };
  }

  async getDetail(id: string): Promise<OnetouchtvDetail> {
    const url = `${this.baseUrl}/vod/${id}/detail`;
    this.logger.log(`GET detail | ${url}`);
    const detailData = await axiosGet<OnetouchtvDetail>(url);
    if (!detailData) throw new OnetouchDetailError("Failed to get detail");
    // const detailData: OnetouchtvDetail = decryptString(encryptedDetail);

    // Save provider content
    const providerContentId = `${this.name}:${id}`;
    const existContent = await getProviderContentById(providerContentId);
    if (!existContent) {
      const providerContent: Omit<
        EProviderContentInsert,
        "createdAt" | "updatedAt"
      > = {
        id: `${this.name}:${detailData.result.id}`,
        contentId: null,
        provider: this.name,
        externalId: detailData.result.id,
        image: detailData.result.image,
        ttl: TTL_MS.content,
        type: "movie",
        title: detailData.result.title,
        year: parseInt(detailData.result.year),
      };
      upsertProviderContent(providerContent);
    }

    return detailData;
  }

  async getEpisode(id: string, episode: string): Promise<OnetouchtvEpisode> {
    const url = `${this.baseUrl}/vod/${id}/episode/${episode}`;
    this.logger.log(`GET episode detail | ${url}`);
    const detailData = await axiosGet<OnetouchtvEpisode>(url);
    if (!detailData)
      throw new OnetouchEpisodeError("Failed to get episode detail");
    return detailData;
  }
}
