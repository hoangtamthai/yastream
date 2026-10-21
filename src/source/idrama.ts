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
import { Prefix, UserConfig } from "../lib/manifest.js";
import { axiosGet } from "../utils/axios.js";
import { cache } from "../utils/cache.js";
import { IDRAMA_ORIGIN } from "../utils/constant.js";
import { ENV } from "../utils/env.js";
import { formatStreamTitle } from "../utils/format.js";
import { probeStreamInfo } from "../utils/info.js";
import { ContentDetail } from "./meta.js";
import { BaseProvider } from "./provider.js";

interface IDramaItem {
  id: string;
  title: string;
  url: string;
  poster: string;
  type: ContentType;
}
interface IDramaDetail {
  urls: string[];
  title: string;
  description: string;
  thumbnail: string;
  year: number;
}
interface IDramaBloggerResult {
  entry: {
    content: {
      $t: string;
    };
    title: {
      $t: string;
    };
    published: {
      $t: string;
    };
    media$thumbnail: {
      url: string;
    };
  };
}

export class IDramaScraper extends BaseProvider {
  baseUrl = IDRAMA_ORIGIN;
  supportedPrefix: Prefix[] = [Prefix.IDRAMA];
  pageSize = 30;
  public readonly BLOG_IDS = {
    TVSABAY: "8016412028548971199",
    ONELEGEND: "596013908374331296",
  };

  async searchCatalog(
    args: CatalogHandlerArgs,
    config: UserConfig,
  ): Promise<MetaPreview[]> {
    const { type, extra } = args;
    const search = extra.search;
    this.logger.log(`Search | ${search}`);
    const url = `${this.baseUrl}/?s=${search}`;
    const searchKey = `search:${url}`;
    const cacheCatalog: MetaPreview[] = cache.get(searchKey);
    if (cacheCatalog) return cacheCatalog;
    const items = await this.getItems(url);
    const catalog: MetaPreview[] = items.map((item) => ({
      id: `${item.id}`,
      type: type,
      name: item.title,
      poster: item.poster,
    }));
    cache.set(searchKey, catalog);
    return catalog;
  }

  async getCatalog(
    args: CatalogHandlerArgs,
    config: UserConfig,
  ): Promise<MetaPreview[]> {
    const { id, type, extra } = args;
    const skip = extra.skip;
    const page = skip ? Math.ceil(skip / this.pageSize) + 1 : 1;
    const url = `${this.baseUrl}/page/${page}/`;
    const catalogKey = `catalog:${url}`;
    const cacheCatalog: MetaPreview[] = cache.get(catalogKey);
    if (cacheCatalog) return cacheCatalog;
    const items = await this.getItems(url);
    const catalog: MetaPreview[] = items.map((item) => ({
      id: `${item.id}`,
      type: type,
      name: item.title,
      poster: item.poster,
    }));
    cache.set(catalogKey, catalog, 4 * 60 * 60 * 1000);
    return catalog;
  }

  async _scrapeDetail(url: string) {
    this.logger.log(`GET scrape | ${url}`);
    const response = await axiosGet<any>(url);
    const $ = cheerio.load(response);
    const rawTitle =
      $("h1.entry-title").text().trim() || $("title").text().trim();
    const title = rawTitle.replace(/-\[.*/g, "");
    const description = $("#player").next("p").text().trim();
    const thumbnail = $('meta[property="og:image"]').attr("content") || "";
    const postId = $("div#player").attr("data-post-id") || "";
    return {
      title: title,
      description: description,
      thumbnail: thumbnail,
      postId: postId,
    };
  }

  async getMeta(
    content: ContentDetail,
    type: ContentType,
  ): Promise<MetaDetail | null> {
    const id = content.idramaId;
    if (!id) {
      return null;
    }
    const metaKey = `meta:${id}`;
    const cacheMeta: MetaDetail = cache.get(metaKey);
    if (cacheMeta) return cacheMeta;
    const videos = await this._getEpisodes(id);
    const title = videos[0]?.title || "";
    const released = videos[0]?.released || new Date().toISOString();
    const formatTitle = title.toLowerCase().trim().replace(/ /g, "-");
    const url = `${this.baseUrl}/${formatTitle}`;
    const detail = await this._scrapeDetail(url);
    videos.forEach((video) => (video.thumbnail = detail.thumbnail));
    const name = title || detail.title;
    const meta: MetaDetail = {
      id: `idrama:${id}`,
      name: name,
      type: "series",
      description: name,
      poster: detail.thumbnail,
      background: detail.thumbnail,
      videos: videos,
      released: released,
    };
    cache.set(metaKey, meta);
    return meta;
  }

  async getStreams(
    content: ContentDetail,
    config: UserConfig,
  ): Promise<Stream[]> {
    const { title, type, year, season, episode, id } = content;
    try {
      if (!id) return [];
      this.logger.log(`Stream | ${title} ${id}`);
      const postId = id;
      const streamKey = `streams:${type}:${id}:${season}:${episode}`;
      const cacheStreams: Stream[] = cache.get(streamKey);
      if (cacheStreams) {
        return cacheStreams;
      }

      const detail = await this.getStreamDetail(postId);
      if (!detail) return [];
      const { urls } = detail;
      this.logger.debug(`Title ${title}`);
      const url = episode ? urls[episode - 1] : urls[0];
      if (!url) return [];
      const info = config.info ? await probeStreamInfo(url) : undefined;
      const formatTitle = formatStreamTitle(title, year, season, episode, info);
      this.logger.log(`Stream Url | ${url}`);
      const streams: Stream[] = [
        {
          url: url,
          name: ENV.DISPLAY_NAME,
          description: `${formatTitle}`,
          behaviorHints: {
            notWebReady: true,
            bingeGroup: this.displayName,
            filename: `${formatTitle}-${this.name}`,
          },
        },
      ];
      cache.set(streamKey, streams);
      return streams;
    } catch (error) {
      this.logger.error(`getStreams failed: ${error}`);
      return [];
    }
  }

  async getSubtitles(content: ContentDetail): Promise<Subtitle[]> {
    return [];
  }

  async _getEpisodes(postId: string): Promise<MetaVideo[]> {
    try {
      const detail = await this.getStreamDetail(postId);
      if (!detail) return [];
      const { urls, title, thumbnail } = detail;
      const videos: MetaVideo[] = urls.map((url, index) => {
        const season = 1;
        return {
          id: `idrama:${postId}:${season}:${index + 1}`,
          title: `${title}`,
          overview: title,
          released: new Date(this._extractReleasedDate(url)).toISOString(),
          episode: index + 1,
          season: season,
          thumbnail: thumbnail,
        };
      });
      return videos;
    } catch (error) {
      this.logger.error(`Episodes not found ${error}`);
      return [];
    }
  }

  async getStreamDetail(postId: string): Promise<IDramaDetail | null> {
    const detailKey = `detail:idrama:${postId}`;
    const cacheDetail = cache.get(detailKey);
    if (cacheDetail) return cacheDetail;
    const isOneLegend =
      this.baseUrl.toLowerCase().includes("onelegend") ||
      this.baseUrl.toLowerCase().includes("idramahd");
    const blogId = isOneLegend
      ? this.BLOG_IDS.ONELEGEND
      : this.BLOG_IDS.TVSABAY;
    const feedUrl = `https://www.blogger.com/feeds/${blogId}/posts/default/${postId}?alt=json`;
    this.logger.log(`GET blogger | ${feedUrl}`);
    const data = await axiosGet<IDramaBloggerResult>(feedUrl);
    if (!data) return null;
    // title: Morodok Sne មរតកស្នេហ៍ 122 -> Morodok Sne
    const title =
      data.entry.title.$t.match(/^[A-Za-z0-9 ]*/)?.[0].trim() ||
      data.entry.title.$t.replace(/^[A-z0-9 ]/g, "").trim();
    const urls = this._extractVideoLinks(data.entry.content.$t);
    const thumbnail = data.entry.media$thumbnail.url;
    const year =
      parseInt(data.entry.published.$t.slice(0, 4)) || new Date().getFullYear();
    const detail = {
      urls: urls,
      title: title,
      description: title,
      thumbnail: thumbnail,
      year: year,
    };
    cache.set(detailKey, detail, 1 * 60 * 60 * 1000);
    return detail;
  }

  _extractReleasedDate = (url: string): string => {
    const match = url.match(/\/(\d{4})\/(\d{2})(\d{2})\//);
    return match
      ? `${match[1]}-${match[2]}-${match[3]}`
      : new Date().toString();
  };

  _extractVideoLinks = (text: string): string[] => {
    // This regex looks for http/https links ending in m3u8 or mp4
    // including query parameters like ?rp=o00
    const regex = /https?:\/\/[^\s"';<> ]+\.(?:m3u8|mp4)(?:\?[^\s"';<> ]+)?/gi;
    const matches = text.match(regex);
    this.logger.log(`Extracted Urls | ${JSON.stringify(matches?.length)}`);
    return matches ? Array.from(new Set(matches)) : [];
  };

  /**
   * Scrapes the list grid (article.hitmag-post)
   */
  async getItems(url: string): Promise<IDramaItem[]> {
    this.logger.log(`GET items | ${url}`);
    const data = await axiosGet<any>(url, { headers: this.headers });
    if (!data) return [];
    const $ = cheerio.load(data);

    const articles = $("article.hitmag-post").toArray();

    // Use map with Promise.all to handle the async calls
    const results: IDramaItem[] = await Promise.all(
      articles.map(async (el) => {
        const $el = $(el);
        const a = $el.find("h3.entry-title a");
        const img = $el.find(".archive-thumb img");

        const rawTitle = a.text().trim();
        const title = rawTitle.replace(/-\[.*/g, "");
        const link = a.attr("href") || "";

        let poster = img.attr("data-src") || img.attr("src") || "";
        if (!poster && img.attr("srcset")) {
          poster = img.attr("srcset")!.split(",")[0]?.split(" ")[0] || "";
        }

        try {
          const { postId } = await this._scrapeDetail(link);

          if (title && link) {
            return {
              id: `idrama:${postId}`,
              title: title,
              url: link,
              poster: poster,
              type: link.includes("/tvshows/") ? "series" : "movie",
            };
          }
        } catch (err) {
          this.logger.error(`Failed to get meta for ${title} | ${err}`);
        }
        return {
          id: url,
          title: title,
          url: link,
          poster: poster,
          type: link.includes("/tvshows/") ? "series" : "movie",
        };
      }),
    );

    return results;
  }
}
