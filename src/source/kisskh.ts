import {
  CatalogHandlerArgs,
  ContentType,
  MetaDetail,
  MetaPreview,
  MetaVideo,
  Stream,
  Subtitle,
} from "@stremio-addon/sdk";
import * as cheerio from "cheerio";
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
import { StreamInsert } from "../db/schema/stream.js";
import { ESubtitleInsert } from "../db/schema/subtitle.js";
import { Prefix, UserConfig } from "../lib/manifest.js";
import ProviderService from "../service/provider/provider-service.js";
import StreamService from "../service/resource/stream-service.js";
import SubtitleService from "../service/resource/subtitle-service.js";
import { axiosGet } from "../utils/axios.js";
import { cache, TTL_MS } from "../utils/cache.js";
import { RATE_LIMIT_DESCRIPTION, TICKCOUNTER_HOST } from "../utils/constant.js";
import { hashSHA256 } from "../utils/crypto.js";
import { getOrigin } from "../utils/domain.js";
import { ENV } from "../utils/env.js";
import {
  handleError,
  KisskhDetailError,
  KisskhEpisodeError,
  KisskhTokenError,
  RateLimitError,
} from "../utils/error.js";
import { cleanUrl, formatStreamTitle, parseOrigin } from "../utils/format.js";
import { matchTitle } from "../utils/fuse.js";
import { probeStreamInfo } from "../utils/info.js";
import { CountryCode, iso639FromCountryCode } from "../utils/language.js";
import { getSetDecryptedSubtitle } from "./kisskh-subtitle.js";
import { ContentDetail } from "./meta.js";
import { getPosterUrl, PosterParam } from "./poster/poster.js";
import { BaseProvider } from "./provider.js";
import { tmdb } from "./tmdb.js";

export interface SearchResult {
  id: number;
  title: string;
  episodesCount: number;
  thumbnail: string;
}

interface KisskhCatalogData {
  data: KisskhCatalogItem[];
}
interface KisskhCatalogItem {
  episodesCount: number;
  thumbnail: string;
  id: number;
  title: string;
}
interface KisskhDetail {
  id: string;
  thumbnail: string;
  title: string;
  country: string;
  description: string;
  episodesCount: number;
  releaseDate: string;
  episodes: Episode[];
}
interface Episode {
  id: number;
  number: number;
  sub: number;
}
interface StreamResponse {
  Video: string;
  [key: string]: any;
}
interface SubResponse {
  src: string;
  label: string;
  land: string;
  default: boolean;
}

const KISSKH_COUNTRY: Record<string, string> = {
  Chinese: "1",
  Korean: "2",
  Japanese: "3",
  Hongkong: "4",
  Thai: "5",
  US: "6",
  Taiwanese: "7",
  Philippine: "8",
};

class KissKHScraperr extends BaseProvider {
  readonly urls = ENV.KISSKH_URLS;
  readonly baseUrl: string = "https://kisskh.co";
  getBaseUrl() {
    return getKisskhBaseUrl();
  }
  readonly supportedPrefix: Prefix[] = [
    Prefix.IMDB,
    Prefix.TMDB,
    Prefix.TVDB,
    Prefix.KISSKH,
    Prefix.ONETOUCHTV,
  ];
  private readonly pageSize = 10;
  private readonly subGuid: string = "VgV52sWhwvBSf8BsM3BRY9weWiiCbtGp";
  private readonly viGuid: string = "62f176f3bb1b5b8e70e39932ad34a0c7";
  private getSearchUrl() {
    return this.getBaseUrl() + "/api/DramaList/Search?q=";
  }
  private getExploreUrl() {
    return this.getBaseUrl() + "/api/DramaList/List";
  }
  private getDetailUrl() {
    return this.getBaseUrl() + "/api/DramaList/Drama";
  }
  private getEpisodeUrl() {
    return this.getBaseUrl() + "/api/DramaList/Episode/{id}.png?kkey=";
  }
  private getSubUrl() {
    return this.getBaseUrl() + "/api/Sub/{id}?kkey=";
  }
  private readonly TYPE: Record<ContentType, string> = {
    series: "1",
    movie: "2",
    channel: "1",
    tv: "1",
  };
  private tokenJsCode: string | null = null;
  private nsfwIds = new Set([
    13449, 13398, 13377, 13373, 13372, 13370, 13446, 13399, 13371, 13306, 13295,
    13286, 13265, 13234, 13224, 13157, 13118, 13117, 13114, 13100, 13092, 13085,
    13073, 13055, 13054, 13048, 13041, 13030, 12977, 12934, 12939, 12938, 12937,
    12936, 12935, 12929, 12928, 12886, 12891, 12887, 12893, 12890, 12889, 12888,
    12809, 12808, 12662, 12660, 12639, 12563, 12519, 12518, 12517, 12516, 12515,
    12514, 12513, 12510, 12504, 12503, 12495, 12491, 12482, 12480, 12413, 12378,
    12332, 12331, 12330, 12314, 12286, 12285, 12284, 12200, 12179, 12177, 12131,
    12130, 12129, 12127, 12125, 12124, 12123, 12121, 12100, 12106, 12097, 12090,
    11952, 11951, 11943, 11915, 11873, 11849, 11834, 11832, 11819, 11790, 11782,
    11781, 11750, 11715, 11707, 11544, 11519, 11518, 11517, 11511, 11509, 11436,
    10942, 10761, 7968,
  ]);
  private kisskhTmdb = new Map([
    [12422, "307602"],
    [7102, "219882"],
    [12479, "241860"],
  ]);

  async searchCatalog(
    args: CatalogHandlerArgs,
    config: UserConfig,
  ): Promise<MetaPreview[]> {
    const { id, type, extra } = args;
    const search = extra.search;
    this.logger.log(`Search | ${search}`);
    if (!search) {
      this.logger.error("Search term is required for search");
      return [];
    }
    const searchResults = await this.searchContent(
      search,
      type,
      undefined,
      undefined,
      false,
    );
    if (!searchResults[0]) return [];
    const filterResults = searchResults.filter((result) => {
      if (type == "series") return result.episodesCount > 1;
      else return result.episodesCount == 1;
    });
    const tmdbDetails = await Promise.all(
      filterResults.map((item) => tmdb.searchDetail(item.title, type)),
    );
    const metas = await Promise.all(
      filterResults.map(async (kissItem, index) => {
        const tmdbDetail = tmdbDetails[index];
        let poster = kissItem.thumbnail;

        // Use custom Poster if available
        if (tmdbDetail) {
          const sameTitleId = this.kisskhTmdb.get(kissItem.id);
          if (sameTitleId) {
            tmdbDetail.id = sameTitleId;
          }
          const posterParam: PosterParam = {
            prefix: Prefix.TMDB,
            id: tmdbDetail.id,
            type,
            fallbackUrl: tmdbDetail.thumbnail || kissItem.thumbnail,
          };
          if (tmdbDetail.imdbId) {
            posterParam.prefix = Prefix.IMDB;
            posterParam.id = tmdbDetail.imdbId;
          }
          poster = await getPosterUrl(posterParam, config);
        }

        // Filter nsfw
        if (!config.nsfw && this.nsfwIds.has(kissItem.id)) {
          poster = this.nsfwDefaultThumbnail;
        }

        const meta: MetaPreview = {
          id: `${Prefix.KISSKH}:${kissItem.id}`,
          name: kissItem.title,
          type: type,
          background: kissItem.thumbnail,
          poster: poster,
        };
        return meta;
      }),
    );
    return metas;
  }

  /**
   * Search Last update of ongoing and complete
   * @param id
   * @param type
   * @param skip
   * @returns
   */
  async getCatalog(
    args: CatalogHandlerArgs,
    config: UserConfig,
  ): Promise<MetaPreview[]> {
    const { id, type, extra } = args;
    const skip = extra.skip;
    let t = this.TYPE[type];
    const ongoing = 1;
    const completed = 2;
    const holliwood = "4";
    const [prefix, typeStr, countryName] = id.split(".");
    if (countryName == "US") {
      t = holliwood;
    }
    const country = KISSKH_COUNTRY[countryName ?? "Korean"];
    let urls = [];
    let urlNum = 1;
    let pageSize = this.pageSize * urlNum;
    if (type === "series" || t === holliwood) {
      urlNum = 2;
      pageSize = this.pageSize * urlNum;
      const page = this.getPage(pageSize, skip, urlNum);
      urls.push(
        this.getExploreUrl() +
          `?page=${page}&type=${t}&sub=0&country=${country}&status=${ongoing}&order=2`,
      );
    }
    const page = this.getPage(pageSize, skip, urlNum);
    urls.push(
      this.getExploreUrl() +
        `?page=${page}&type=${t}&sub=0&country=${country}&status=${completed}&order=2`,
    );

    // 1. Fetch all catalogs concurrently
    const catalogDatas = await Promise.all(
      urls.map((url) => {
        this.logger.log(`GET catalog | ${url}`);
        return axiosGet<KisskhCatalogData>(url);
      }),
    );

    // 2. Filter null and flat to one list from multiple urls
    const flatDatas = catalogDatas
      .filter((res): res is KisskhCatalogData => !!res?.data)
      .flatMap((res) => res.data);

    // 3. Search TMDB using the flattened list
    const tmdbDetails = await Promise.all(
      flatDatas.map((item) => tmdb.searchDetail(item.title, type)),
    );

    // 4. Map to final Meta format
    const metas = await Promise.all(
      flatDatas.map(async (kissItem, index) => {
        const tmdbDetail = tmdbDetails[index];
        let poster = kissItem.thumbnail;
        let id = `${Prefix.KISSKH}:${kissItem.id}`;
        // Use TMDB/RPDB if available
        if (tmdbDetail) {
          const sameTitleId = this.kisskhTmdb.get(kissItem.id);
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
              title: kissItem.title,
              ttl: TTL_MS.provider,
              contentId: contentId,
              provider: this.name,
              externalId: kissItem.id.toString(),
              image: kissItem.thumbnail,
              year: tmdbDetail.year,
              id: id,
              type: type,
            });
          }
        }

        // NSFW Override
        if (!config.nsfw && this.nsfwIds.has(kissItem.id)) {
          poster = this.nsfwDefaultThumbnail;
        }
        const metaDetail: MetaDetail = {
          id: id,
          name: kissItem.title,
          type: type,
          background: kissItem.thumbnail,
          poster,
        };

        if (type === "movie") {
          metaDetail.behaviorHints = {
            defaultVideoId: `${id}:1:1`,
          };
          return metaDetail;
        }
        return metaDetail;
      }),
    );
    return metas;
  }

  async getMeta(
    content: ContentDetail,
    type: ContentType,
  ): Promise<MetaDetail | null> {
    const detail = await this.getDetail(content.id);
    let year = new Date(detail.releaseDate).getFullYear();
    let date = new Date(detail.releaseDate).toISOString();
    const tmdbDetail = await tmdb.searchDetail(detail.title, type);
    const background = tmdbDetail?.background || detail.thumbnail;
    let oldContent: EContent | undefined = undefined;
    if (tmdbDetail) {
      detail.description = tmdbDetail.overview || detail.description;
      year = tmdbDetail.year;
      const tmdbDate = new Date();
      tmdbDate.setFullYear(tmdbDetail.year);
      date = tmdbDate.toISOString();
      oldContent = await getContentByTmdb(tmdbDetail.id, type);
      if (oldContent) {
        upsertContent(oldContent.id, tmdbDetail, TTL_MS.content);
      }
    }
    const season = 1;
    const videos: MetaVideo[] = detail.episodes.map((ep) => {
      const episodeNum = ep.number;
      let id = `kisskh:${detail.id}:${season}:${episodeNum}`;
      // In Kisskh sometimes movie also has multiple episodes
      return {
        id: id,
        released: date,
        title: detail.title,
        type: type,
        description: detail.description,
        thumbnail: detail.thumbnail,
        background: background,
        season: season,
        episode: episodeNum,
      };
    });
    let metaId = `${Prefix.KISSKH}:${detail.id}`;
    const meta: MetaDetail = {
      id: metaId,
      name: detail.title,
      logo: tmdbDetail?.logo ?? "",
      poster: detail.thumbnail,
      background: background,
      type: type,
      description: detail.description,
      country: detail.country,
      released: date,
      videos: videos,
    };

    const existingContent = await getProviderContentById(metaId);
    const contentId = oldContent ? oldContent.id : null;
    if (existingContent && oldContent) {
      await upsertProviderContent({
        ...existingContent,
        contentId: contentId,
        image: detail.thumbnail,
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
        image: detail.thumbnail,
        year: year,
        type: type,
      });
    }
    return meta;
  }

  async getStreams(
    content: ContentDetail,
    config: UserConfig,
  ): Promise<Stream[]> {
    this.logger.log(`Stream | ${content.title} ${content.id}`);
    const { title, type, year, season, episode, id, kisskhId, altTitle } =
      content;
    try {
      const streamKey = `streams:${type}:${this.name}:${id}:${season}:${episode}:${config.info}`;
      const cacheStreams = cache.get(streamKey);
      if (cacheStreams) return cacheStreams;
      const dbStreams = await StreamService.getDbStreams(
        `${this.name}:${kisskhId}`,
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
      let streamId = parseInt(kisskhId ?? "0");
      let streamTitle = title;
      if (!kisskhId) {
        const searchResult = await this.searchContent(
          title,
          type,
          year,
          season,
          true,
          altTitle,
        );
        if (!searchResult[0]) {
          this.logger.log("No results");
          return [];
        }
        const search = searchResult[0];
        streamId = search.id;
        streamTitle = search.title;
      }
      const streams = await this.generateStreamsAndSubtitles(
        streamId,
        streamTitle,
        content,
        config,
      );
      if (streams.length > 0) cache.set(streamKey, streams, TTL_MS.stream);
      return streams;
    } catch (error: any) {
      handleError(error, this.logger);
      if (error instanceof RateLimitError)
        return [
          {
            name: this.displayName,
            description: RATE_LIMIT_DESCRIPTION,
            externalUrl: getOrigin(),
            behaviorHints: {
              notWebReady: true,
              bingeGroup: `${this.displayName}`,
              filename: `${RATE_LIMIT_DESCRIPTION}-${this.name}`,
            },
          },
        ];
      return [];
    }
  }

  async getSubtitles(content: ContentDetail): Promise<Subtitle[]> {
    const subtitleKey = `subtitles:${content.type}:${this.name}:${content.id}:${content.season}:${content.episode}`;
    let kisskhId = content.kisskhId ? parseInt(content.kisskhId) : undefined;
    let cacheSubtitles = cache.get(subtitleKey);
    if (cacheSubtitles) return cacheSubtitles;
    const savedSubtitles = await SubtitleService.getSubtitlesFromDb(
      `${this.name}:${content.kisskhId}`,
      1,
      content.episode ?? 1,
    );
    if (savedSubtitles.length > 0) {
      cache.set(subtitleKey, savedSubtitles, TTL_MS.stream);
      return savedSubtitles;
    }
    if (!kisskhId) {
      const search = await this.searchContent(
        content.title,
        content.type,
        content.year,
        content.season,
        true,
        content.altTitle,
      );
      if (!search[0]) return [];
      kisskhId = search[0]?.id;
    }
    const episodeData = await this._getEpisode(kisskhId, content.episode);
    const episodeId = episodeData.episodeId;
    const subtitles = this._getSubtitles(episodeId, kisskhId, content.episode);
    return subtitles;
  }

  async searchContent(
    title: string,
    type: ContentType,
    year?: number,
    season?: number,
    filter: boolean = true,
    altTitle?: string,
  ): Promise<SearchResult[]> {
    switch (type) {
      case "series":
      case "movie":
        const shows = await this._getShows(
          title,
          year,
          season,
          filter,
          altTitle,
        );
        return shows;
      default:
        return [];
    }
  }

  async generateStreamsAndSubtitles(
    kisskhId: number,
    title: string,
    content: ContentDetail,
    config: UserConfig,
  ): Promise<Stream[]> {
    const { episode, id, season, year, type } = content;
    const { episodeId, kisskhDetail } = await this._getEpisode(
      kisskhId,
      episode,
    );
    const token = await this._getToken(episodeId, this.viGuid);
    const stream = await this._getStream(episodeId, token);
    if (!stream) return [];
    if (!stream.Video) return [];
    const url = this._fixUrl(stream.Video);
    if (url.includes(TICKCOUNTER_HOST)) return [];
    await ProviderService.syncContentAndProvider(
      content,
      kisskhId.toString(),
      this.name,
    );
    // const tmdbDetail = await tmdb.searchDetail(content.title, type);
    // if (tmdbDetail) {
    //   const oldContent = await getContentByTmdb(tmdbDetail.id, type);
    //   if (oldContent) {
    //     const contentId = oldContent.id;
    //     upsertContent(contentId, tmdbDetail, TTL_MS.content);
    //     const providerContent = await getProviderContentById(
    //       `${Prefix.KISSKH}:${kisskhId}`,
    //     );
    //     if (providerContent) {
    //       upsertProviderContent({
    //         ...providerContent,
    //         title: kisskhDetail.title,
    //         contentId: contentId,
    //       });
    //     } else {
    //       upsertProviderContent({
    //         id: `${Prefix.KISSKH}:${kisskhId}`,
    //         contentId: contentId,
    //         title: kisskhDetail.title,
    //         ttl: null,
    //         provider: this.name,
    //         externalId: kisskhId.toString(),
    //         image: kisskhDetail.thumbnail,
    //         year: year,
    //         type: type,
    //       });
    //     }
    //   }
    // }
    // Handle rate limit
    if (stream.Video.includes(RATE_LIMIT_DESCRIPTION))
      throw new RateLimitError(content.title);
    const info = config.info ? await probeStreamInfo(url) : undefined;
    const formatTitle = formatStreamTitle(title, year, season, episode, info);
    const streamDatas: Stream[] = [
      {
        url: url,
        name: this.displayName,
        description: formatTitle,
        behaviorHints: {
          notWebReady: true,
          bingeGroup: `${this.displayName}`,
          filename: `${formatTitle}-${this.name}`,
        },
      },
    ];
    const streamRow: StreamInsert = {
      id: uuidv7(),
      providerContentId: `${this.name}:${kisskhId}`,
      provider: this.name,
      externalId: kisskhId.toString(),
      // season: season?.toString() ?? "1",
      season: "1",
      episode: episode?.toString() ?? "1",
      url: cleanUrl(url),
      ttl: TTL_MS.stream,
    };
    if (info?.resolution) {
      streamRow.resolution = `${info.resolution.width}x${info.resolution.height}`;
    }
    if (info?.size) streamRow.size = info.size.toFixed(2).toString();
    if (info?.hours && info?.minutes) {
      streamRow.duration = (info.hours * 60 + info.minutes).toString();
    }
    if (url.includes("m3u8")) {
      const playlist = await axiosGet<string>(url);
      if (playlist) {
        // streamRow.playlist = playlist;
        streamRow.hash = hashSHA256(playlist);
        upsertStream([streamRow]);
      }
    } else {
      upsertStream([streamRow]);
    }
    return streamDatas;
  }

  private async _getToken(episodeId: string, uid: string): Promise<string> {
    if (!this.tokenJsCode) {
      const html = await axiosGet<string>(this.getBaseUrl() + "/index.html");
      if (!html)
        throw new KisskhTokenError(
          `Failed to fetch index.html for token generation`,
        );
      const $ = cheerio.load(html);
      const scriptSrc = $('script[src*="common"]').attr("src");
      const jsCode = await axiosGet<string>(
        this.getBaseUrl() + "/" + scriptSrc,
      );
      this.tokenJsCode = jsCode;
    }

    const sandbox = `
            ${this.tokenJsCode};
            _0x54b991(${episodeId}, null, "2.8.10", "${uid}", 4830201, "kisskh", "kisskh", "kisskh", "kisskh", "kisskh", "kisskh");
        `;

    try {
      const token = eval(sandbox);
      if (!token) {
        throw new KisskhTokenError(`Token generation failed`);
      }
      return token;
    } catch (e) {
      throw new KisskhTokenError(`Token generation failed | ${e}`);
    }
  }

  private async _getShows(
    title: string,
    year?: number,
    season?: number,
    isFilter: boolean = true,
    altTitle?: string,
  ): Promise<SearchResult[]> {
    const url = `${this.getSearchUrl()}${title}&type=0`;
    this.logger.log(`GET search | ${url}`);
    const searchData = await axiosGet(url);
    if (!searchData) {
      return [];
    }
    const showList = searchData as SearchResult[];
    const show = isFilter
      ? matchTitle(showList, title, year, season, altTitle)
      : showList;
    this.logger.debug(`SeriesId/MovieId | ${JSON.stringify(show[0]?.id)}`);
    return show;
  }

  public async getContent(episodeId: string): Promise<Stream[]> {
    const streamKey = `streams:kisskh:${episodeId}`;
    const cacheContent = cache.get(streamKey);
    return cacheContent;
  }

  public async getDetail(kisskhId: string): Promise<KisskhDetail> {
    const url = `${this.getDetailUrl()}/${kisskhId}`;
    this.logger.log(`GET detail | ${url}`);
    const episodesData = await axiosGet<KisskhDetail>(url, {
      headers: this.headers,
    });
    if (episodesData) {
      return episodesData;
    } else
      throw new KisskhDetailError(`Not found detail from id | ${kisskhId}`);
  }

  private async _getEpisode(
    seriesId: number,
    episode: number = 1,
  ): Promise<{ episodeId: string; kisskhDetail: KisskhDetail }> {
    const detail = await this.getDetail(seriesId.toString());
    const episodeCount = detail.episodesCount;
    if (!detail || episodeCount === undefined) {
      throw new KisskhEpisodeError("No episode data found");
    }
    const fallbackEpisodeData = detail.episodes[episodeCount - episode];
    const episodeData =
      detail.episodes.find((episodeData) => {
        return episodeData.number == episode;
      }) || fallbackEpisodeData;

    const episodeId = episodeData?.id;
    if (!episodeId) {
      throw new KisskhEpisodeError(
        `Episode ID not found ${this.name}:${seriesId}:${episode}`,
      );
    }
    this.logger.debug(`EpisodeId | ${episodeId}`);
    return { episodeId: episodeId.toString(), kisskhDetail: detail };
  }

  private async _getStream(episodeId: string, token: string) {
    const url = this.getEpisodeUrl().replace("{id}", episodeId) + token;
    this.logger.log(`GET stream | ${url}`);
    try {
      const stream = await axiosGet<StreamResponse>(url, { timeout: 15000 });
      if (!stream) {
        return null;
      }
      this.logger.log(`Stream Url | ${stream.Video}`);
      markKisskhUrlSuccess(url);
      return stream;
    } catch (error) {
      if (error instanceof RateLimitError) {
        markKisskhUrlFail(url);
        return { Video: RATE_LIMIT_DESCRIPTION };
      }
      handleError(error, this.logger, `Fail to get stream`);
      return null;
    }
  }

  private async _getSubtitles(
    episodeId: string,
    kisskhId: number,
    episode?: number,
  ): Promise<Subtitle[]> {
    const token = await this._getToken(episodeId, this.subGuid);
    const subtitleUrl = this.getSubUrl().replace("{id}", episodeId) + token;
    this.logger.log(`GET subtitles | ${subtitleUrl}`);
    const subtitleDatas = await axiosGet<SubResponse[]>(subtitleUrl);
    if (!subtitleDatas) return [];
    const decryptedSubtitleMap = new Map<string, string>();
    const subtitles: Subtitle[] = await Promise.all(
      subtitleDatas.entries().map(async ([index, subtitleData]) => {
        const lang = iso639FromCountryCode(subtitleData.land as CountryCode);
        const src = subtitleData.src;
        const subtitle: Subtitle = {
          id: `${this.name}-${index.toString()}`,
          lang: lang,
          url: src,
          label: `${this.name}`,
        };
        if (this._needsDecryption(src)) {
          // set to global cache
          const decryptedSubtitle = await getSetDecryptedSubtitle(src);
          if (decryptedSubtitle) {
            subtitle.url = this._createSubtitleUrl(src);
            decryptedSubtitleMap.set(subtitle.url, decryptedSubtitle);
          }
        }
        return subtitle;
      }),
    );
    if (subtitles.length > 0) {
      const subtitleRows = await Promise.all(
        subtitles.map(async (subtitle) => {
          const subtitleRow: Omit<ESubtitleInsert, "createdAt"> = {
            ...subtitle,
            id: uuidv7(),
            providerContentId: `${this.name}:${kisskhId}`,
            season: "1",
            episode: episode?.toString() ?? "1",
          };
          if (this._needsDecryption(subtitle.url)) {
            // Only save encrypted subtitle
            subtitleRow.subtitle = decryptedSubtitleMap.get(subtitle.url);
          }
          subtitleRow.ttl = TTL_MS.stream;
          return subtitleRow;
        }),
      );
      upsertSubtitles(subtitleRows);
    }
    this.logger.log(`Subtitles found | ${subtitles.length}`);
    return subtitles;
  }

  private _needsDecryption(url: string): boolean {
    const lowerUrl = url.split("?")[0]?.toLowerCase() || url.toLowerCase();
    return lowerUrl.includes(".txt");
  }

  private _createSubtitleUrl(originalUrl: string): string {
    return `${getOrigin()}/subtitle/${originalUrl}`;
  }

  private _fixUrl(url: string): string {
    if (!url.startsWith("http")) {
      return `https:${url}`;
    }
    return url;
  }
}

interface UrlMetrics {
  success: number;
  fail: number;
  lastUsed: number;
}

const kisskhMetrics = new Map<string, UrlMetrics>();

function selectKisskhUrl(): string {
  for (const url of ENV.KISSKH_URLS) {
    const metrics = kisskhMetrics.get(url);
    if (!metrics || metrics.fail === 0) {
      return url;
    }
  }
  if (Math.random() < 0.2) {
    const randomIndex = Math.floor(Math.random() * ENV.KISSKH_URLS.length);
    return ENV.KISSKH_URLS[randomIndex]!;
  }
  const sorted = ENV.KISSKH_URLS.map((url) => ({
    url,
    metrics: kisskhMetrics.get(url),
  })).sort((a, b) => {
    const aScore =
      ((a.metrics?.success ?? 0) + 1) / ((a.metrics?.fail ?? 0) + 1);
    const bScore =
      ((b.metrics?.success ?? 0) + 1) / ((b.metrics?.fail ?? 0) + 1);
    return bScore - aScore;
  });
  return sorted[0]?.url || "https://kisskh.co";
}

export function getKisskhMetrics(): Map<string, UrlMetrics> {
  return kisskhMetrics;
}

/**
 * Reset all KissKH metrics - useful when system is blocked or to clear stale data
 */
export function resetKisskhMetrics(): void {
  kisskhMetrics.clear();
}

export function getKisskhBaseUrl(): string {
  return selectKisskhUrl();
}

export function markKisskhUrlSuccess(url: string): void {
  const host = parseOrigin(url);
  const newMetrics = {
    success: 0,
    fail: 0,
    lastUsed: 0,
  };
  const metrics = kisskhMetrics.get(host) ?? newMetrics;
  metrics.success++;
  metrics.lastUsed = Date.now();
  kisskhMetrics.set(host, metrics);
}

export function markKisskhUrlFail(url: string): void {
  const host = parseOrigin(url);
  const metrics = kisskhMetrics.get(host) ?? {
    success: 0,
    fail: 0,
    lastUsed: 0,
  };
  metrics.fail++;
  metrics.lastUsed = Date.now();
  kisskhMetrics.set(host, metrics);
}

export default KissKHScraperr;
