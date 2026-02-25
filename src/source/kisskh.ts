import axios from "axios";
import * as cheerio from "cheerio";
import {
  ContentType,
  MetaDetail,
  MetaPreview,
  MetaVideo,
  Stream,
  Subtitle,
} from "stremio-addon-sdk";
import { KisskhCatalog, Prefix } from "../lib/manifest.js";
import { cache } from "../utils/cache.js";
import { envGet } from "../utils/env.js";
import { matchTitle } from "../utils/fuse.js";
import { parseStreamInfo } from "../utils/info.js";
import { CountryCode, iso639FromCountryCode } from "../utils/language.js";
import { getSetDecryptedSubtitle } from "../utils/subtitle.js";
import { ContentDetail } from "./meta.js";
import { BaseProvider } from "./provider.js";
import { axiosGet } from "../utils/axios.js";

export interface SearchResult {
  id: string;
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
  Philippine: "8",
};

class KissKHScraperr extends BaseProvider {
  readonly baseUrl: string = "https://kisskh.co";
  readonly supportedPrefix: Prefix[] = [
    Prefix.IMDB,
    Prefix.TMDB,
    Prefix.TVDB,
    Prefix.KISSKH,
  ];
  private readonly subGuid: string = "VgV52sWhwvBSf8BsM3BRY9weWiiCbtGp";
  private readonly viGuid: string = "62f176f3bb1b5b8e70e39932ad34a0c7";
  private readonly searchUrl: string =
    this.baseUrl + "/api/DramaList/Search?q=";
  private readonly exploreUrl: string = this.baseUrl + "/api/DramaList/List";
  private readonly detailUrl: string = this.baseUrl + "/api/DramaList/Drama/";
  private readonly episodeUrl: string =
    this.baseUrl + "/api/DramaList/Episode/{id}.png?kkey=";
  private readonly subUrl: string = this.baseUrl + "/api/Sub/{id}?kkey=";
  private readonly TYPE: Record<ContentType, string> = {
    series: "1",
    movie: "2",
    channel: "1",
    tv: "1",
  };
  private tokenJsCode: string | null = null;

  async searchCatalog(
    id: string,
    type: ContentType,
    search: string,
  ): Promise<MetaPreview[]> {
    this.logger.log(`Search | ${search}`);
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
    const metas = filterResults.map((detail) => {
      const meta: MetaPreview = {
        id: `${Prefix.KISSKH}:${detail.id}`,
        name: detail.title,
        type: type,
        background: detail.thumbnail,
        poster: detail.thumbnail,
        posterShape: "regular",
      };
      return meta;
    });
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
    id: string,
    type: ContentType,
    skip?: number,
  ): Promise<MetaPreview[]> {
    const t = this.TYPE[type];
    const ongoing = 1;
    const completed = 2;
    const [prefix, typeStr, countryName] = id.split(".");
    const country = countryName
      ? KISSKH_COUNTRY[countryName]
      : KISSKH_COUNTRY["KOREAN"];
    const pageSize = 20;
    let urls = [];
    let urlNum = 1;
    let page = this.getPage(pageSize, skip, urlNum);
    if (type === "series") {
      urlNum = 2;
      page = this.getPage(pageSize, skip, urlNum);
      urls.push(
        this.exploreUrl +
          `?page=${page}&type=${t}&sub=0&country=${country}&status=${ongoing}&order=2`,
      );
    }
    urls.push(
      this.exploreUrl +
        `?page=${page}&type=${t}&sub=0&country=${country}&status=${completed}&order=2`,
    );
    const promises = urls.map(async (url) => {
      this.logger.log(`GET catalog | ${url}`);
      return axiosGet(url);
    });
    const datas: KisskhCatalogData[] = await Promise.all(promises);
    const metas = datas
      .map((data) => {
        // const data: KisskhCatalogData = data.data;
        const metas = data.data.map((kisskhMeta) => {
          const meta: MetaPreview = {
            id: `${Prefix.KISSKH}:${kisskhMeta.id}`,
            name: kisskhMeta.title,
            type: type,
            background: kisskhMeta.thumbnail,
            poster: kisskhMeta.thumbnail,
            posterShape: "regular",
          };
          return meta;
        });
        return metas;
      })
      .flat();
    return metas;
  }

  async getMeta(id: string, type: ContentType): Promise<MetaDetail | null> {
    const detail = await this.getDetail(id);
    const season = 1;
    const date = new Date(detail.releaseDate).toISOString();
    const videos: MetaVideo[] = detail.episodes.map((episode, index) => {
      const episodeNum = index + 1;
      if (type === "series") {
        return {
          id: `kisskh:${detail.id.toString()}:${season}:${episodeNum}`,
          released: date,
          title: detail.title,
          type: type,
          description: detail.description,
          thumbnail: detail.thumbnail,
          background: detail.thumbnail,
          season: season,
          episode: index + 1,
        };
      } else {
        return {
          id: `kisskh:${detail.id.toString()}:${season}:${episodeNum}`,
          released: date,
          title: detail.title,
          type: type,
          description: detail.description,
          thumbnail: detail.thumbnail,
          background: detail.thumbnail,
          season: season,
          episode: index + 1,
        };
      }
    });
    const meta: MetaDetail = {
      id: `kisskh:${detail.id}`,
      name: detail.title,
      poster: detail.thumbnail,
      background: detail.thumbnail,
      posterShape: "regular",
      type: type,
      description: detail.description,
      country: detail.country,
      released: date,
      videos: videos,
    };
    return meta;
  }

  async getStreams(
    title: string,
    type: ContentType,
    year?: number,
    season?: number,
    episode?: number,
    id?: string,
    altTitle?: string,
  ): Promise<Stream[] | null> {
    try {
      if (id) {
        const streamKey = `streams:kisskh:${type}:${id}:${season}:${episode}`;
        const cacheStreams = cache.get(streamKey);
        if (cacheStreams) return cacheStreams;
      }
      const streamKey = `streams:kisskh:${type}:${id}:${season}:${episode}`;
      const cacheStreams = cache.get(streamKey);
      if (cacheStreams !== null) {
        return cacheStreams;
      }

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
        return null;
      }
      const streams = await this.generateStreamsAndSubtitles(
        searchResult[0],
        type,
        year,
        season,
        episode,
        id,
      );
      cache.set(streamKey, streams, 4 * 60 * 60 * 1000);
      return streams;
    } catch (error: any) {
      this.logger.error(`Error | ${error.message}`);
    }
    return null;
  }

  async getSubtitles(content: ContentDetail): Promise<Subtitle[]> {
    const search = await this.searchContent(
      content.title,
      content.type,
      content.year,
      content.season,
      true,
      content.altTitle,
    );
    if (!search[0]) return [];
    const episodeId = await this._getEpisode(
      search[0]?.id,
      content.type,
      content.episode,
    );
    const subtitles = this._getSubtitles(episodeId);
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
    searchResult: SearchResult,
    type: ContentType,
    year?: number,
    season?: number,
    episode?: number,
    id?: string,
  ) {
    const episodeId = await this._getEpisode(searchResult.id, type, episode);
    const token = await this._getToken(episodeId, this.viGuid);
    const stream = await this._getStream(episodeId, token);
    const url = this._fixUrl(stream.Video!);
    let info;
    try {
      info = parseStreamInfo(url);
    } catch (error) {
      this.logger.error(`Fail to parse stream info | ${error}`);
    }
    const subtitleKey = `subtitles:kisskh:${type}:${id}:${season}:${episode}`;
    // Handle subtitles
    let subtitles = cache.get(subtitleKey);
    if (subtitles) cache.set(subtitleKey, subtitles);
    else {
      subtitles = await this._getSubtitles(episodeId);
      cache.set(subtitleKey, subtitles);
    }

    const formatTitle = this.formatStreamTitle(
      searchResult.title,
      year,
      season,
      episode,
      await info,
    );
    const streams: Stream[] = [
      {
        url: url,
        name: "yastream",
        title: formatTitle,
        behaviorHints: {
          notWebReady: true,
          group: `yastream-kisskh`,
        },
      },
    ];
    return streams;
  }

  private async _getToken(episodeId: string, uid: string): Promise<string> {
    if (!this.tokenJsCode) {
      const { data: html } = await axios.get(this.baseUrl + "/index.html");
      const $ = cheerio.load(html);
      const scriptSrc = $('script[src*="common"]').attr("src");
      const { data: jsCode } = await axios.get(this.baseUrl + "/" + scriptSrc);
      this.tokenJsCode = jsCode;
    }

    const sandbox = `
            ${this.tokenJsCode};
            _0x54b991(${episodeId}, null, "2.8.10", "${uid}", 4830201, "kisskh", "kisskh", "kisskh", "kisskh", "kisskh", "kisskh");
        `;

    try {
      const token = eval(sandbox);
      if (!token) {
        throw new Error(`[KISSKH] Token generation failed`);
      }
      return token;
    } catch (e) {
      throw new Error(`[KISSKH] Token generation failed | ${e}`);
    }
  }

  private async _getShows(
    title: string,
    year?: number,
    season?: number,
    isFilter: boolean = true,
    altTitle?: string,
  ): Promise<SearchResult[]> {
    const url = `${this.searchUrl}${title}&type=0`;
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
    const url = `${this.detailUrl}${kisskhId}`;
    this.logger.log(`GET detail | ${url}`);
    const episodesData = await axiosGet(url, { headers: this.headers });
    return episodesData;
  }

  private async _getEpisode(
    seriesId: string,
    type: ContentType,
    episode: number = 1,
  ) {
    switch (type) {
      case "series":
        if (!episode) {
          this.logger.error("Episode number required for series");
          throw new Error(`[KISSKH] Episode number required for series`);
        }
        break;
      default:
        break;
    }
    const detail = await this.getDetail(seriesId);
    const episodeCount = detail.episodesCount;
    if (!detail || episodeCount === undefined) {
      throw new Error("No episode data found");
    }
    const fallbackEpisodeData = detail.episodes[episodeCount - episode];
    const episodeData =
      detail.episodes.find((episodeData) => {
        return episodeData.number == episode;
      }) || fallbackEpisodeData;

    const episodeId = episodeData?.id;
    if (!episodeId) {
      throw new Error("Episode ID not found");
    }
    this.logger.debug(`EpisodeId | ${episodeId}`);
    return episodeId.toString();
  }

  private async _getStream(episodeId: string, token: string) {
    const url = this.episodeUrl.replace("{id}", episodeId) + token;
    this.logger.log(`GET stream | ${url}`);
    const stream = await axiosGet(url);
    this.logger.log(`Stream Url | ${stream.Video}`);
    return stream;
  }

  private async _getSubtitles(episodeId: string): Promise<Subtitle[]> {
    const token = await this._getToken(episodeId, this.subGuid);
    const subtitleUrl = this.subUrl.replace("{id}", episodeId) + token;
    this.logger.log(`GET subtitles | ${subtitleUrl}`);
    const subtitleDatas: SubResponse[] = await axiosGet(subtitleUrl);
    const subtitles: Subtitle[] = [];
    for (const [index, subtitleData] of subtitleDatas.entries()) {
      const lang = iso639FromCountryCode(subtitleData.land as CountryCode);
      const src = subtitleData.src;
      const subtitle: Subtitle = {
        id: index.toString(),
        lang: lang,
        url: src,
      };
      if (this._needsDecryption(src)) {
        // set to global cache
        getSetDecryptedSubtitle(src);
        const url = this._createSubtitleUrl(src);
        subtitle.url = url;
      }
      subtitles.push(subtitle);
    }
    this.logger.log(`Subtitles found | ${subtitles.length}`);
    return subtitles;
  }

  private _needsDecryption(url: string): boolean {
    const lowerUrl = url.split("?")[0]?.toLowerCase() || url.toLowerCase();
    return lowerUrl.includes(".txt");
  }

  private _createSubtitleUrl(originalUrl: string): string {
    const domain = envGet("DOMAIN") || "localhost";
    const port = envGet("PORT") || "55913";
    const protocol = domain === "localhost" ? "http" : "https";
    const baseUrl =
      domain === "localhost"
        ? `${protocol}://${domain}:${port}`
        : `${protocol}://${domain}`;
    return `${baseUrl}/subtitle/${originalUrl}`;
  }

  private _fixUrl(url: string): string {
    if (!url.startsWith("http")) {
      return `https:${url}`;
    }
    return url;
  }
}

export default KissKHScraperr;
