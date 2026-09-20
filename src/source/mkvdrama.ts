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
import { CookieData } from "puppeteer";
import { uuidv7 } from "uuidv7";
import { upsertStream } from "../db/queries.js";
import {
  getMkvdrama,
  upsertMkvdrama as upsertMkvdramas,
} from "../db/query/mkvdrama.js";
import { upsertOuos } from "../db/query/ouo.js";
import { EJob, JOB_STATUS, JOB_TYPE } from "../db/schema/job.js";
import { EOuoInsert } from "../db/schema/ouo.js";
import { Prefix, UserConfig } from "../lib/manifest.js";
import {
  addJob,
  getJob,
  getJobQueue,
  JobMkvdramaScrape,
  JobMkvdramaStream,
} from "../service/job/job.js";
import ProviderService from "../service/provider/provider-service.js";
import StreamService from "../service/resource/stream-service.js";
import { axiosGet } from "../utils/axios.js";
import {
  FlareSolverrResponse,
  getFlareSolverr,
} from "../utils/browser/flaresolverr.js";
import { getRedirectedUrlCDP } from "../utils/browser/puppeteer.js";
import { cache, TTL_MS } from "../utils/cache.js";
import { getOrigin } from "../utils/domain.js";
import { ENV } from "../utils/env.js";
import { handleError, MkvdramaError, OuoError } from "../utils/error.js";
import { extractTitle } from "../utils/format.js";
import { matchTitle } from "../utils/fuse.js";
import { Quality } from "../utils/info.js";
import { ntfy } from "../utils/notify/ntfy.js";
import { EpisodeHoster, hosterToStream } from "./hoster/hoster.js";
import { ContentDetail } from "./meta.js";
import { BaseProvider, Provider } from "./provider.js";
import {
  FILECRYPT_HOST,
  FILECRYPT_ORIGIN,
  getUrlsFromFilecrypt,
} from "./web/filecrypt.js";
import { getOuoFinalUrl, getOuoId, OUO_HOSTS } from "./web/ouo.js";
import {
  getUrlsFromViewcrateDlc,
  VIEWCRATE_HOST,
  VIEWCRATE_ORIGIN,
} from "./web/viewcrate.js";
interface MkvdramaSeries {
  id: string;
  title: string;
  url: string;
  poster: string;
  type: ContentType;
  country: string;
}
interface MkvdramaSearch {
  url: string;
  title: string;
  mkvdramaId: string;
}

interface MkvdramaDetail {
  title: string;
  description: string;
  thumbnail: string;
  url: string;
}

interface MkvdramaEpisode {
  id: string;
  number: number;
  title: string;
  url: string;
}

// export const MKVDRAMA_HOST = "mkvdrama.net";
export const MKVDRAMA_ORIGIN = ENV.MKVDRAMA_URL;
// export const MKVDRAMA_HOST
const BEST_QUALITIES = ["2160p", "1080pHD", "1080p"];

const MKVDRAMA_COUNTRY: Record<string, string> = {
  Korean: "south-korea",
  Chinese: "china",
  Japanese: "japan",
  Thai: "thailand",
  Philippine: "philippines",
  Popular: "",
};

export default class MkvdramaScraper extends BaseProvider {
  readonly baseUrl = MKVDRAMA_ORIGIN;
  readonly supportedPrefix: Prefix[] = [
    Prefix.IMDB,
    Prefix.TMDB,
    Prefix.TVDB,
    Prefix.KISSKH,
    Prefix.ONETOUCHTV,
    Prefix.MKVDRAMA,
  ];
  readonly pageSize = 30;
  async searchCatalog(
    args: CatalogHandlerArgs,
    config: UserConfig,
  ): Promise<MetaPreview[]> {
    const { type, extra } = args;
    const search = extra.search;
    if (!search) return [];
    this.logger.log(`Search | ${search}`);
    const url = `${this.baseUrl}/search?q=${search}`;
    const cacheKey = `search:${this.name}:${url}`;
    const cacheResult: MetaPreview[] = cache.get(cacheKey);
    if (cacheResult) return cacheResult;
    const items = await this.getItems(url);
    const catalog: MetaPreview[] = items.map((item) => ({
      id: `${this.name}:${item.id}`,
      type: type || "series",
      name: item.title,
      poster: item.poster,
    }));
    cache.set(cacheKey, catalog, 30 * 60 * 1000);
    return catalog;
  }

  async getCatalog(
    args: CatalogHandlerArgs,
    config: UserConfig,
  ): Promise<MetaPreview[]> {
    const { id, type, extra } = args;
    const cacheKey = `catalog:${this.name}:${id}`;
    const cacheResult: MetaPreview[] = cache.get(cacheKey);
    if (cacheResult) return cacheResult;
    const [prefix, _, country] = id.split(".");
    const skip = extra.skip;
    const page = skip ? Math.ceil(skip / this.pageSize) + 1 : 1;
    const countryName = MKVDRAMA_COUNTRY[country!];
    const url = `${this.baseUrl}/titles?country[]=${countryName}&status=&type=drama&order=latest&page=${page}`;
    const items = await this.getItems(url);
    const catalog: MetaPreview[] = items.map((item) => ({
      id: `mkvdrama:${item.id}`,
      type: type || "series",
      name: item.title,
      poster: item.poster,
    }));
    cache.set(cacheKey, catalog, 60 * 60 * 1000);
    return catalog;
  }

  async getMeta(
    content: ContentDetail,
    type: ContentType,
  ): Promise<MetaDetail | null> {
    const { mkvdramaId } = content;
    if (!mkvdramaId) return null;
    const metaKey = `meta:${this.name}:${mkvdramaId}`;
    const cacheMeta: MetaDetail = cache.get(metaKey);
    if (cacheMeta) return cacheMeta;
    const data = await this.getDetailAndEpisodes(mkvdramaId);
    if (!data) return null;
    const { detail, episodes } = data;
    if (!detail) return null;
    const meta: MetaDetail = {
      ...detail,
      type: "series",
      videos: episodes,
    };
    cache.set(metaKey, meta, 60 * 60 * 1000);
    return meta;
  }

  async getStreams(
    content: ContentDetail,
    config: UserConfig,
  ): Promise<Stream[]> {
    try {
      const { title, type, year, id, season } = content;
      this.logger.log(`Stream | ${title} ${id}`);
      let mkvdramaId = content.mkvdramaId;
      const episode = content.episode ?? 1;
      const configKey = `${config.tbKey}:${config.mfpUrl}:${config.mfpPass}`;
      const streamKey = `streams:${type}:${configKey}:${this.name}:${id}:${season}:${episode}`;
      const cacheStreams: Stream[] = cache.get(streamKey);
      if (cacheStreams) return cacheStreams;

      if (!mkvdramaId) {
        mkvdramaId = (await this.getSearch(title, year, season))?.mkvdramaId;
      }
      if (!mkvdramaId) return [];
      const dbStreams = await StreamService.getDbStreams(
        `${this.name}:${mkvdramaId}`,
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

      // Add job
      const jobId = `job:streams:${this.name}:${mkvdramaId}`;
      const job = await getJob(jobId);
      const { total, wait } = await getJobQueue();
      let description = `${total} in queue\nWait about ${wait} minutes`;
      if (job) {
        switch (job.status) {
          case JOB_STATUS.PENDING:
            break;
          case JOB_STATUS.FAILED:
            description = `Failed to get stream\nThis stream flow is not implemented yet\nAdmin will check this`;
            break;
          default:
            break;
        }
      } else {
        await addJob({
          id: jobId,
          status: JOB_STATUS.PENDING,
          type: JOB_TYPE.MKVDRAMA_STREAM,
          data: JSON.stringify({ mkvdramaId, content }),
        });
        description = `${total + 1} in queue\nWait about ${wait + 1} minutes`;
      }
      return [
        {
          name: this.displayName,
          description: description,
          externalUrl: getOrigin(),
          behaviorHints: {
            notWebReady: true,
            filename: `${description}-${this.name}`,
          },
        },
      ];
    } catch (error) {
      handleError(error, this.logger, `Fail getStreams ${content.title}`);
      return [];
    }
  }

  async getSearch(
    title: string,
    year: number,
    season?: number,
  ): Promise<MkvdramaSearch | null> {
    const extractedTitle = extractTitle(title);
    const url = `${this.baseUrl}/search?q=${extractedTitle.title}`;
    this.logger.log(`GET search | ${url}`);
    const data = await axiosGet<string>(url);
    if (!data) return null;

    const searches = this.parseSearch(data);
    const match = matchTitle(searches, title, year, season);
    if (!match[0]) return null;
    const matchDetail = match[0];
    return matchDetail;
  }

  async getSubtitles(content: ContentDetail): Promise<Subtitle[]> {
    return [];
  }

  async getItems(url: string): Promise<MkvdramaSeries[]> {
    try {
      this.logger.log(`GET items | ${url}`);
      const data = await this._fetchDirectAndFlareSolverr(url);
      if (!data) return [];
      let content = "";
      if (typeof data == "string") content = data;
      else {
        content = data.solution?.response || content;
      }
      const $ = cheerio.load(content);
      const articles = $("article.bs").toArray();
      const results: MkvdramaSeries[] = articles
        .map((el) => {
          const $el = $(el);
          const a = $el.find("a.tip");
          const img = $el.find("img");
          const rawTitle = a.attr("title") || "";
          const link = a.attr("href") || "";
          const id = link.replace(/^\//, "").replace(/\/$/, "");
          const poster = img.attr("src") || img.attr("data-src") || "";
          const country = $el.find(".country").text().trim();
          const typeText = $el.find(".typez").text().trim();
          return {
            id,
            title: rawTitle,
            url: link,
            poster,
            type: (typeText.toLowerCase().includes("movie")
              ? "movie"
              : "series") as ContentType,
            country,
          };
        })
        .filter((item) => item.title && item.url);
      return results;
    } catch (error) {
      this.logger.error(`getItems failed: ${error}`);
      return [];
    }
  }

  parseSearch(html: string): MkvdramaSearch[] {
    const $ = cheerio.load(html);
    const series: MkvdramaSearch[] = [];
    $("article.bs").each((_, el) => {
      const href = $(el).find('a[itemprop="url"]').attr("href");
      const title = $(el).find("b").text().trim();
      if (href && title) {
        const mkvdramaId = href.replace(/^\//, "").replace(/\/$/, "");
        const url = new URL(href, this.baseUrl).toString();
        series.push({ title, url, mkvdramaId });
      }
    });
    return series;
  }

  async getDetailAndEpisodes(id: string): Promise<{
    detail: MetaDetail;
    episodes: MetaVideo[];
    links: { link: string; quality: string }[];
    response: FlareSolverrResponse;
    password: string | null;
  } | null> {
    try {
      const url = `${this.baseUrl}/${id}`;
      this.logger.log(`GET detail | ${url}`);
      const response = await getFlareSolverr(url, this.name, 5);
      console.log(response);
      const content = response?.solution?.response || "";
      if (!response || content.includes("Preparing...")) {
        this.logger.error(`Not found detail from id | ${id}`);
        return null;
      }
      const $ = cheerio.load(content);
      const rawTitle = $("title").text();
      const title =
        $("h1").text().trim() || rawTitle.slice(0, rawTitle.indexOf("at"));
      const description = $(".entry-content p").first().text().trim();
      const thumbnail = $('meta[property="og:image"]').attr("content") || "";
      const time = $("time").text();
      const detail: MetaDetail = {
        id: `${this.name}:${id}`,
        name: title,
        type: "series",
        description: description,
        poster: thumbnail,
        background: thumbnail,
        released: new Date(time).toISOString(),
      };
      const qualityBlocks = $("div.soraddlx").toArray();
      const ouoRedirectLinks: { link: string; quality: string }[] = [];
      let minEpisode = 0;
      let maxEpisode = 0;
      for (const qualityBlock of qualityBlocks) {
        const $qualityBlock = $(qualityBlock);
        const h3Text: string = $qualityBlock.find("h3").text() || "";
        const titleMatch = h3Text.match(/Episode\s+(\d+)\s*-\s*(\d+)/i);
        if (titleMatch) {
          minEpisode = parseInt(titleMatch[1]!, 10);
          maxEpisode = parseInt(titleMatch[2]!, 10);
        }
        const linkBlocks = $qualityBlock.find("div.soraurlx").toArray();
        if (linkBlocks.length === 0) continue;
        linkBlocks.forEach((linkBlock) => {
          const $link = $(linkBlock);
          const links = $link.find("a").toArray();
          const $quality = $link.find("strong");
          links.forEach((link) => {
            const $link = $(link);
            const ouoRedirectLink: string = $link.attr("href") || "";
            const quality: string = $quality.text();
            if ($link.text().trim().includes("Link 1") && quality) {
              this.logger.log(
                `ouoRedirectLink ${ouoRedirectLink}, quality ${quality}`,
              );
              ouoRedirectLinks.push({ link: ouoRedirectLink, quality });
            }
          });
        });
      }
      const season = 1;
      const episodes: MetaVideo[] = [];
      const highQualities = ["1080p", "1080pHD"];
      for (let ep = minEpisode; ep <= maxEpisode; ep++) {
        const ouoLink = ouoRedirectLinks.find((link) =>
          highQualities.includes(link.quality),
        )?.link;
        if (!ouoLink) continue;
        const title = ouoRedirectLinks.find((link) =>
          highQualities.includes(link.quality),
        )?.quality;
        if (!title) continue;
        const episode: MetaVideo = {
          id: `${this.name}:${ouoLink}:${season}:${ep}`,
          title: `${detail.name} ${highQualities}`,
          episode: ep,
          season: season,
          overview: `${highQualities} Download`,
          released: new Date(time).toISOString(),
        };
        episodes.push(episode);
      }
      // Extract password from admin comment (first moderator comment)
      const password =
        $(".fe-role-badge--moderator")
          .first()
          .closest(".fe-comment-card")
          .find(".fe-comment-text")
          .attr("data-raw-body")
          ?.replace(/\*\*/g, "")
          .trim() || null;

      return {
        detail,
        episodes,
        links: ouoRedirectLinks,
        response: response,
        password: password,
      };
    } catch (error) {
      handleError(error, this.logger, `getDetailAndEpisodes failed`);
      return null;
    }
  }

  async getContentsFromPage(pageUrl: string): Promise<ContentDetail[]> {
    const response = await getFlareSolverr(pageUrl, this.name, 4);
    const content = response?.solution?.response || "";
    if (!response || content.includes("Preparing...")) {
      this.logger.error(`Not found content from page url | ${pageUrl}`);
      throw new MkvdramaError("No content from page url");
    }
    const $ = cheerio.load(content);
    const contents = $("article.bs")
      .toArray()
      .map((el) => {
        const $el = $(el);
        const $a = $el.find("a.tip");
        const href = $a.attr("href") || "";
        const id = href.replace(/^\//, "").replace(/\/$/, "");
        const title =
          $a.attr("title") ||
          $el.find("h2").attr("content") ||
          $el.find("h2").text().trim();
        const country = $el.find(".country").text().trim();
        const type: ContentType = "series";
        const content: ContentDetail = {
          id,
          mkvdramaId: id,
          title,
          type,
          year: new Date().getFullYear(),
        };
        return content;
      });
    this.logger.log(`Page ${pageUrl}: ${contents.length}`);
    return contents;
  }

  async runMkvdramaScrape(job: EJob) {
    const jobData: JobMkvdramaScrape = JSON.parse(job.data);
    const pageUrl = jobData.pageUrl;
    const contents = await this.getContentsFromPage(pageUrl);
    contents.forEach((content) => {
      const jobId = `job:streams:${this.name}:${content.mkvdramaId}`;
      const jobData: JobMkvdramaStream = {
        mkvdramaId: content.id,
        content,
      };
      addJob({
        id: jobId,
        status: JOB_STATUS.PENDING,
        type: JOB_TYPE.MKVDRAMA_STREAM,
        data: JSON.stringify(jobData),
      });
    });
  }

  async runMkvdramaStream(job: EJob) {
    const jobData: JobMkvdramaStream = JSON.parse(job.data);
    const mkvdramaId = jobData.mkvdramaId;
    const content = jobData.content;
    const providerContentId = `${this.name}:${mkvdramaId}`;

    const dbMkvdrama = await this.getDbMkvdrama(`${this.name}:${mkvdramaId}`);
    let ouos: (EOuoInsert & { quality: Quality })[] = [];
    if (dbMkvdrama && dbMkvdrama.length > 0) {
      dbMkvdrama.forEach((mkvdrama) => {
        const ouo = mkvdrama.ouo;
        if (ouo) ouos.push({ ...ouo, quality: mkvdrama.quality as Quality });
      });
    }

    if (ouos.length === 0) {
      const data = await this.getDetailAndEpisodes(mkvdramaId);
      if (!data || !(data.links.length > 0)) {
        throw new MkvdramaError("No data found");
      }
      const detail = data.detail;
      // resolve all links
      const bestLinks = data.links.filter((link) =>
        BEST_QUALITIES.includes(link.quality),
      );
      const links = await Promise.all(
        bestLinks.map(async (link) => {
          const redirectUrl = new URL(link.link, this.baseUrl).toString();
          const ouoLink = await getRedirectedUrlCDP(
            redirectUrl,
            data.response?.solution?.cookies,
            data.response?.solution?.userAgent,
          );
          return { link: ouoLink, quality: link.quality };
        }),
      );
      const redirects = await Promise.all(
        links.map(async (link) => {
          const originalUrl = link.link;
          if (!originalUrl) return;
          let redirectedUrl: string | undefined;
          let id: string | undefined;
          const isOuo = OUO_HOSTS.some((host) => originalUrl.includes(host));
          switch (true) {
            case isOuo:
              redirectedUrl = await getOuoFinalUrl(originalUrl);
              id = getOuoId(originalUrl);
              break;
            case originalUrl.includes(VIEWCRATE_ORIGIN):
            case originalUrl.includes(FILECRYPT_ORIGIN):
              redirectedUrl = originalUrl;
              id = getOuoId(originalUrl);
              break;
            default:
              redirectedUrl = originalUrl;
              break;
          }
          if (id && redirectedUrl) {
            const ouo: EOuoInsert & { quality: Quality } = {
              id,
              originalUrl,
              redirectedUrl,
              password: data.password,
              quality: link.quality as Quality,
            };
            // ouos.push(ouo);
            return ouo;
          }
          return;
        }),
      );
      redirects.forEach((redirect) => {
        if (redirect) ouos.push(redirect);
      });
      if (ouos.length === 0) throw new OuoError("No ouo links found");
      upsertOuos(ouos);

      const syncContent = { ...content, title: detail.name };
      if (detail.poster) syncContent.thumbnail = detail.poster;
      await ProviderService.syncContentAndProvider(
        syncContent,
        mkvdramaId,
        this.name,
      );

      upsertMkvdramas(
        ouos.map((ouo) => {
          return {
            id: uuidv7(),
            providerContentId: providerContentId,
            ouoId: ouo.id,
            quality: ouo.quality,
            ttl: TTL_MS.stream,
          };
        }),
      );
    }

    const streamRows = await Promise.all(
      ouos.map(async (ouo) => {
        const redirectedUrl = ouo.redirectedUrl;
        if (!redirectedUrl) {
          throw new MkvdramaError("No redirected url");
        }
        let urls = [];
        let episodes: EpisodeHoster[] = [];
        // can have protected content (password required)
        try {
          switch (true) {
            case redirectedUrl.includes(VIEWCRATE_HOST):
              const viewcrate = await getUrlsFromViewcrateDlc(redirectedUrl);
              urls = viewcrate.urls;
              episodes = viewcrate.episodes;
              break;
            case redirectedUrl.includes(FILECRYPT_HOST):
              const filecrypt = await getUrlsFromFilecrypt(redirectedUrl);
              urls = filecrypt.urls;
              episodes = filecrypt.episodes;
              break;
            default:
              urls.push(redirectedUrl);
              break;
          }
        } catch (error) {
          handleError(error, this.logger, `Fail getUrlsFromViewcrateDlc`);
          ntfy(
            "yastream viewcrate/filecrypt failed",
            `${redirectedUrl}`,
            "min",
          );
          throw error;
        }
        const streamRows = hosterToStream(
          urls,
          episodes,
          ouo.quality,
          providerContentId,
          this.name,
          mkvdramaId,
          "1",
        );
        return streamRows;
      }),
    );
    const streams = streamRows.flat().filter((stream) => stream !== undefined);
    const streamMap = Object.groupBy(streams, (stream) => stream.episode);
    Object.values(streamMap).forEach((episodeStreams) => {
      if (episodeStreams) upsertStream(episodeStreams.flat());
    });
    return;
  }

  async getDbMkvdrama(providerContentId: string) {
    return getMkvdrama(providerContentId);
  }

  async getRedirectedUrls(
    urls: string[],
    cookies?: CookieData[],
    userAgent?: string,
  ): Promise<string[] | null> {
    let ouoLink: string | null = "";
    try {
      const redirectedUrls = await Promise.all(
        urls.map(async (url) => {
          ouoLink = await getRedirectedUrlCDP(url, cookies, userAgent);
          return ouoLink;
        }),
      );
      return redirectedUrls.filter((ouoLink) => ouoLink != null);
    } catch (error) {
      handleError(error, this.logger, `Fail getRedirectedUrls`);
      return null;
    }
  }
  /** First get from flaresolverr ~2s, if fail then browser CDP ~4s */
  async getRedirectedUrl(
    url: string,
    cookies?: CookieData[],
    userAgent?: string,
  ): Promise<string | null> {
    let ouoLink: string | null = "";
    try {
      const response = await getFlareSolverr(url, this.name, 1);
      ouoLink = response?.solution?.url || null;
      if (ouoLink) {
        if (OUO_HOSTS.some((host) => ouoLink?.includes(host))) {
          this.logger.log(`getRedirectedUrl ${url} from flaresolverr`);
          return ouoLink;
        }
      }
      ouoLink = await getRedirectedUrlCDP(url, cookies, userAgent);
      this.logger.log(`getRedirectedUrl ${url} from puppeteer`);
      return ouoLink;
    } catch (error) {
      handleError(error, this.logger, `Fail getRedirectedUrl ${url}`);
      return null;
    }
  }

  async _fetchDirectAndFlareSolverr(
    url: string,
  ): Promise<string | FlareSolverrResponse | null> {
    const response = await this._fetchDirect(url);
    if (response) return response;
    return getFlareSolverr(url, this.name);
  }

  async _fetchDirect(url: string): Promise<string | null> {
    try {
      const response = await axiosGet<string>(url, { headers: this.headers });
      if (
        response &&
        !response.includes("cloudflare") &&
        !response.includes("Checking your browser")
      ) {
        return response;
      }
    } catch (error) {
      this.logger.warn(`Axios request failed: ${error}`);
    }
    return null;
  }
}

export const mkvdrama = new MkvdramaScraper(Provider.MKVDRAMA);
