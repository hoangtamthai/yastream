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
  upsertContent,
  upsertProviderContent,
} from "../db/queries.js";
import { Prefix, UserConfig } from "../lib/manifest.js";
import { axiosGet } from "../utils/axios.js";
import { cache, TTL_MS } from "../utils/cache.js";
import { ASIANTV_ORIGIN } from "../utils/constant.js";
import { handleError } from "../utils/error.js";
import { formatStreamTitle } from "../utils/format.js";
import { matchTitle } from "../utils/fuse.js";
import { probeStreamInfo } from "../utils/info.js";
import { ContentDetail } from "./meta.js";
import { getPosterUrl, PosterParam } from "./poster/poster.js";
import { BaseProvider } from "./provider.js";
import { tmdb } from "./tmdb.js";

export function sortEpisodes(episodes: AsiantvEpisode[]): AsiantvEpisode[] {
  if (episodes.length === 0) return [];
  const names = episodes.map((episode) => episode.name);
  const isNumeric = names.every((name) => /^\d+(\.\d+)?$/.test(name));
  if (isNumeric) {
    return [...episodes].sort(
      (a, b) => parseFloat(a.name) - parseFloat(b.name),
    );
  }
  const isDate = names.every((name) => /^\d{4}-\d{2}-\d{2}$/.test(name));
  if (isDate) {
    return [...episodes].sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...episodes].reverse();
}

export function isPlayableMirror(mirror: AsiantvMirror) {
  return mirror.videotype === 2 || mirror.videourl.includes(".m3u8");
}

function stripLanguageTag(title: string) {
  return title.replace(/\s*\((?:Cantonese|Mandarin|粵|國)[^)]*\)\s*$/i, "");
}

function isValidYear(year: number) {
  return Number.isInteger(year) && year >= 1900 && year <= 2100;
}

function episodeReleased(name: string, year: number) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(name)) return new Date(name).toISOString();
  const releaseYear = isValidYear(year) ? year : new Date().getFullYear();
  return new Date(`${releaseYear}-01-01`).toISOString();
}

export class AsiantvScraper extends BaseProvider {
  baseUrl = ASIANTV_ORIGIN;
  supportedPrefix: Prefix[] = [
    Prefix.IMDB,
    Prefix.TMDB,
    Prefix.TVDB,
    Prefix.ASIANTV,
  ];

  async searchCatalog(
    args: CatalogHandlerArgs,
    config: UserConfig,
  ): Promise<MetaPreview[]> {
    try {
      const { type, extra } = args;
      const search = extra.search;
      if (!search) return [];
      this.logger.log(`Search | ${search}`);
      const siteType = type === "movie" ? 2 : 1;
      const url = `${this.baseUrl}/api/movies?search=${encodeURIComponent(search)}&type=${siteType}&limit=${PAGE_SIZE}`;
      const data = await axiosGet<AsiantvList>(url);
      if (!data?.movies?.length) return [];
      const movies = data.movies.filter((movie) =>
        this.matchesType(movie, type),
      );
      return await Promise.all(
        movies.map((movie) => this.toMetaPreview(movie, type, config)),
      );
    } catch (error) {
      handleError(error, this.logger, `Failed to search ${args.extra.search}`);
      return [];
    }
  }

  async getCatalog(
    args: CatalogHandlerArgs,
    config: UserConfig,
  ): Promise<MetaPreview[]> {
    try {
      const { id, type, extra } = args;
      const [, , name] = id.split(".");
      const country = ASIANTV_CATALOG[name ?? ""];
      if (!country) return [];
      const siteType = type === "movie" ? 2 : 1;
      const page = this.getPage(PAGE_SIZE, extra.skip);
      const url = `${this.baseUrl}/api/movies?type=${siteType}&country=${country}&limit=${PAGE_SIZE}&page=${page}`;
      this.logger.log(`GET catalog | ${url}`);
      const data = await axiosGet<AsiantvList>(url);
      if (!data?.movies?.length) return [];
      const movies = data.movies.filter((movie) =>
        this.matchesType(movie, type),
      );
      return await Promise.all(
        movies.map((movie) => this.toMetaPreview(movie, type, config)),
      );
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
      const asiantvId = content.asiantvId;
      if (!asiantvId) return null;
      const detail = await this.getDetail(asiantvId);
      if (!detail) return null;
      const episodes = sortEpisodes(detail.episodes ?? []);
      const poster = content.thumbnail || this.imageUrl(detail.poster);
      const background = content.background || this.imageUrl(detail.backdrop);
      const year = isValidYear(content.year)
        ? content.year
        : isValidYear(detail.year)
          ? detail.year
          : new Date().getFullYear();
      const title = content.title || detail.title;
      const videos: MetaVideo[] = episodes.map((episode, index) => ({
        id: `${Prefix.ASIANTV}:${asiantvId}:1:${index + 1}`,
        title: episode.name === "Full" ? title : `${title} ${episode.name}`,
        released: episodeReleased(episode.name, year),
        season: 1,
        episode: index + 1,
        thumbnail: poster,
        background,
      }));
      const meta: MetaDetail = {
        id: content.id,
        type,
        name: title,
        poster,
        background,
        description: content.overview || detail.description,
        released: episodeReleased(episodes[0]?.name ?? "", year),
        genres: detail.categories,
      };
      if (type === "series" && videos.length > 0) meta.videos = videos;
      return meta;
    } catch (error) {
      handleError(error, this.logger, `Failed to get meta ${content.title}`);
      return null;
    }
  }

  async getStreams(
    content: ContentDetail,
    config: UserConfig,
  ): Promise<Stream[]> {
    const { title, type, year, season, episode } = content;
    try {
      const streamKey = `streams:${type}:${this.name}:${content.id}:${season}:${episode}:${config.info}`;
      const cached: Stream[] = cache.get(streamKey);
      if (cached) return cached;
      let asiantvId = content.asiantvId;
      if (!asiantvId) {
        const found = await this.searchMovie(title, type, year);
        if (!found) return [];
        asiantvId = found.id;
      }
      const detail = await this.getDetail(asiantvId);
      if (!detail) return [];
      const episodes = sortEpisodes(detail.episodes ?? []);
      const target =
        type === "movie" ? episodes[0] : episodes[(episode ?? 1) - 1];
      if (!target) return [];
      const episodeDetail = await this.getEpisode(target.id);
      if (!episodeDetail) return [];
      // shortcut: direct m3u8 mirrors only, resolve drive embed pages if a title lacks one
      const mirrorsByServer = await Promise.all(
        episodeDetail.servers.map(async (server) => ({
          server,
          mirrors: (await this.getMirrors(server.eId)).filter(
            isPlayableMirror,
          ),
        })),
      );
      const streams = await Promise.all(
        mirrorsByServer.flatMap(({ server, mirrors }) =>
          mirrors.map(async (mirror, index) => {
            const info = config.info
              ? await probeStreamInfo(mirror.videourl)
              : undefined;
            const formatTitle = formatStreamTitle(
              title,
              year,
              type === "movie" ? undefined : season,
              episode,
              info,
            );
            const stream: Stream = {
              url: mirror.videourl,
              name: this.displayName,
              description: `${formatTitle}\n${server.langName} | ${mirror.name}`,
              behaviorHints: {
                notWebReady: true,
                bingeGroup: `${this.name}-${server.langName}-${index}`,
                filename: `${formatTitle}-${this.name}`,
              },
            };
            return stream;
          }),
        ),
      );
      const uniqueStreams = this.dedupeStreams(streams);
      if (uniqueStreams.length > 0) {
        cache.set(streamKey, uniqueStreams, TTL_MS.stream);
      }
      return uniqueStreams;
    } catch (error) {
      handleError(error, this.logger, `Failed to get streams ${title}`);
      return [];
    }
  }

  getSubtitles(content: ContentDetail): Promise<Subtitle[]> {
    return Promise.resolve([]);
  }

  async getDetail(id: string): Promise<AsiantvMovie | null> {
    const cacheKey = `asiantv:detail:${id}`;
    const cached: AsiantvMovie = cache.get(cacheKey);
    if (cached) return cached;
    const url = `${this.baseUrl}/api/movies/${id}`;
    this.logger.log(`GET detail | ${url}`);
    const data = await axiosGet<AsiantvDetail>(url);
    if (!data?.movie) return null;
    cache.set(cacheKey, data.movie, TTL_MS.content);
    return data.movie;
  }

  private async getEpisode(
    id: number,
  ): Promise<AsiantvEpisodeDetail | null> {
    const cacheKey = `asiantv:episode:${id}`;
    const cached: AsiantvEpisodeDetail = cache.get(cacheKey);
    if (cached) return cached;
    const url = `${this.baseUrl}/api/episodes/${id}`;
    this.logger.log(`GET episode | ${url}`);
    const data = await axiosGet<AsiantvEpisodeResponse>(url);
    if (!data?.episode) return null;
    cache.set(cacheKey, data.episode, TTL_MS.stream);
    return data.episode;
  }

  private async getMirrors(eId: number): Promise<AsiantvMirror[]> {
    const cacheKey = `asiantv:mirrors:${eId}`;
    const cached: AsiantvMirror[] = cache.get(cacheKey);
    if (cached) return cached;
    const url = `${this.baseUrl}/api/ep/${eId}`;
    this.logger.log(`GET mirrors | ${url}`);
    const data = await axiosGet<AsiantvMirror[]>(url);
    if (!Array.isArray(data)) return [];
    cache.set(cacheKey, data, TTL_MS.stream);
    return data;
  }

  private async searchMovie(
    title: string,
    type: ContentType,
    year?: number,
  ): Promise<AsiantvMovie | null> {
    const siteType = type === "movie" ? 2 : 1;
    const url = `${this.baseUrl}/api/movies?search=${encodeURIComponent(title)}&type=${siteType}&limit=10`;
    const data = await axiosGet<AsiantvList>(url);
    if (!data?.movies?.length) return null;
    const candidates = data.movies
      .filter((movie) => this.matchesType(movie, type))
      .map((movie) => ({ ...movie, title: movie.englishTitle || movie.title }));
    if (candidates.length === 0) return null;
    try {
      const [match] = matchTitle(candidates, title, year, 1);
      return match ?? null;
    } catch {
      return null;
    }
  }

  private async toMetaPreview(
    movie: AsiantvMovie,
    type: ContentType,
    config: UserConfig,
  ): Promise<MetaPreview> {
    const displayTitle = movie.englishTitle || movie.title;
    const sitePoster = this.imageUrl(movie.poster);
    let id = `${Prefix.ASIANTV}:${movie.id}`;
    let poster = sitePoster;
    let contentId: string | null = null;
    const tmdbDetail = await tmdb.searchDetail(
      stripLanguageTag(displayTitle),
      type,
      isValidYear(movie.year) ? movie.year : undefined,
    );
    const metaId = tmdbDetail?.imdbId ?? tmdbDetail?.tmdbId?.toString();
    if (tmdbDetail && metaId) {
      contentId = await this.saveContent(tmdbDetail, type);
      const posterParam: PosterParam = {
        prefix: tmdbDetail.imdbId ? Prefix.IMDB : Prefix.TMDB,
        id: metaId,
        type,
        fallbackUrl: tmdbDetail.thumbnail || sitePoster,
      };
      poster = await getPosterUrl(posterParam, config);
      if (tmdbDetail.imdbId) id = tmdbDetail.imdbId;
    }
    await upsertProviderContent({
      id: `${this.name}:${movie.id}`,
      contentId,
      title: displayTitle,
      ttl: TTL_MS.provider,
      provider: this.name,
      externalId: movie.id,
      image: sitePoster,
      year: movie.year,
      type,
    });
    const meta: MetaDetail = { id, type, name: displayTitle, poster };
    if (type === "movie") {
      meta.behaviorHints = {
        defaultVideoId: `${Prefix.ASIANTV}:${movie.id}:1:1`,
      };
    }
    return meta;
  }

  private async saveContent(detail: ContentDetail, type: ContentType) {
    const tmdbId = detail.tmdbId;
    if (!tmdbId) return null;
    const existing = await getContentByTmdb(tmdbId.toString(), type);
    if (existing) return existing.id;
    const contentId = uuidv7();
    await upsertContent(contentId, detail, TTL_MS.content);
    return contentId;
  }

  private matchesType(movie: AsiantvMovie, type: ContentType) {
    if (type === "movie") return movie.type === "single";
    return movie.type === "series" || movie.type === "show";
  }

  private imageUrl(path: string) {
    return path ? new URL(path, this.baseUrl).toString() : "";
  }

  private dedupeStreams(streams: Stream[]) {
    const seen = new Set<string>();
    return streams.filter((stream) => {
      if (!stream.url) return false;
      const key = (() => {
        try {
          return new URL(stream.url).pathname;
        } catch {
          return stream.url;
        }
      })();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export interface AsiantvEpisode {
  id: number;
  name: string;
}

export interface AsiantvMovie {
  id: string;
  title: string;
  englishTitle: string;
  poster: string;
  backdrop: string;
  year: number;
  categories: string[];
  description: string;
  type: string;
  episodes?: AsiantvEpisode[];
}
export interface AsiantvMirror {
  name: string;
  videourl: string;
  videotype: number;
}
interface AsiantvList {
  movies: AsiantvMovie[];
}
interface AsiantvDetail {
  movie: AsiantvMovie;
}
interface AsiantvServer {
  langName: string;
  eId: number;
}
interface AsiantvEpisodeDetail {
  id: number;
  servers: AsiantvServer[];
}
interface AsiantvEpisodeResponse {
  episode: AsiantvEpisodeDetail;
}

const PAGE_SIZE = 20;
const ASIANTV_CATALOG: Record<string, number> = {
  Korean: 2,
  Chinese: 3,
  US: 6,
  Japanese: 4,
  Cantonese: 1,
  Taiwanese: 5,
};
