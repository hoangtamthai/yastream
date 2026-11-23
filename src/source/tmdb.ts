import { ContentType } from "@stremio-addon/sdk";
import { AxiosRequestConfig } from "axios";
import { URLSearchParams } from "url";
import { axiosGet } from "../utils/axios.js";
import { ENV } from "../utils/env.js";
import { handleError, TmdbError } from "../utils/error.js";
import { cache, TTL_MS } from "../utils/cache.js";
import { extractTitle } from "../utils/format.js";
import {
  isCandidateAllowed,
  MIN_TITLE_SIMILARITY,
  parseCatalogTitle,
  titleSimilarity,
} from "../utils/title-variants.js";
import { matchTitle } from "../utils/fuse.js";
import { getProxyUrl } from "../utils/proxy/proxy.js";
import { BaseMeta, ContentDetail } from "./meta.js";
import { Provider } from "./provider.js";

export interface TmdbFindResponse {
  movie_results: TmdbMovieResult[];
  person_results: any[];
  tv_results: TmdbTvResult[];
  tv_episode_results: any[];
  tv_season_results: any[];
}

export interface TmdbMovieImagesExternalId extends TmdbMovieResult {
  images?: TmdbTvImages;
  external_ids?: TmdbExternalID;
}
export interface TmdbTvImagesExternalId extends TmdbTvResult {
  images?: TmdbTvImages;
  external_ids?: TmdbExternalID;
}

export interface TmdbTvResult {
  id: number;
  imdb_id?: string;
  name: string;
  original_name: string;
  overview: string;
  first_air_date: string;
  poster_path: string;
  backdrop_path?: string;
  origin_country?: string[];
  original_language?: string;
}
export interface TmdbTvImages {
  backdrops: TmdbTvImage[];
  logos: TmdbTvImage[];
  posters: TmdbTvImage[];
}
interface TmdbTvImage {
  aspect_ratio: number;
  height: number;
  iso_3166_1: string;
  iso_639_1: string;
  file_path: string;
  vote_average: number;
  vote_count: number;
  width: number;
}

interface TmdbExternalID {
  id: number;
  imdb_id: string | null;
  freebase_mid: string | null;
  freebase_id: string | null;
  tvdb_id: number | null;
  tvrage_id: number | null;
  wikidata_id: string | null;
  facebook_id: string | null;
  instagram_id: string | null;
  twitter_id: string | null;
}

export interface TmdbMovieResult {
  id: number;
  imdb_id?: string;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  poster_path: string;
  backdrop_path?: string;
  original_language?: string;
}

interface TmdbMovieSearch {
  results: TmdbMovieResult[];
}
interface TmdbTvSearch {
  results: TmdbTvResult[];
}
export const TMDB_HOST = "api.tmdb.org";
class TMDBService extends BaseMeta {
  private apiKey: string = ENV.TMDB_API_KEY;
  private baseUrl: string = `https://${TMDB_HOST}/3`;
  private imageUrl: string = "https://image.tmdb.org";

  // Search
  async searchDetail(
    search: string,
    type: ContentType,
    year?: number,
  ): Promise<ContentDetail | null> {
    const extracted = extractTitle(search);
    const season = extracted.season || 1;
    search = extracted.title;
    if (season == 1) {
      year = extracted.year || year;
    } else {
      year = undefined;
    }
    if (type === "series") {
      return await this.searchSeriesDetail(search, year);
    } else {
      return await this.searchMovieDetail(search, year);
    }
  }

  async searchSeriesDetail(
    title: string,
    year?: number,
  ): Promise<ContentDetail | null> {
    try {
      const response = await this.getSearchSeries(title, year);
      const titles = response.results.map((result) => {
        const year = new Date(result.first_air_date).getFullYear();
        const thumbnail = result.poster_path
          ? `${this.imageUrl}/t/p/w500${result.poster_path}`
          : "";
        const search: ContentDetail = {
          id: result.id.toString(),
          title: result.name,
          overview: result.overview,
          thumbnail: thumbnail,
          year: year,
          type: "series",
          tmdbId: result.id,
        };
        return search;
      });
      const detail = matchTitle<ContentDetail>(titles, title, year);
      const tv = detail[0];
      if (tv) {
        this.logger.log(`Found | ${tv.title} ${tv.year} ${tv.imdbId || ""}`);
        const detail = await this.getSeriesDetail(tv.id);
        return detail;
      }
      return null;
    } catch (error: any) {
      handleError(error, this.logger, `Search series`);
      return null;
    }
  }

  /**
   * Catalog lookup: the regular search first, then a stricter-but-wider
   * fallback only when it finds nothing, so existing matches never change.
   */
  async searchCatalogDetail(
    rawTitle: string,
    type: ContentType,
    options: {
      query?: string | undefined;
      year?: number | undefined;
      country?: string | undefined;
    } = {},
  ): Promise<ContentDetail | null> {
    const detail = await this.searchDetail(
      options.query ?? rawTitle,
      type,
      options.year,
    );
    if (detail) return detail;
    return await this.searchDetailFallback(rawTitle, type, options.country);
  }

  /**
   * Fallback for catalog titles the regular search misses: strips edition
   * labels ("(Uncut Version)", "(BL)"...), season subtitles, bilingual
   * " - " titles; allows +-1 year; checks original and alternative titles;
   * filters by the catalog's country. Never switches movie <-> series.
   */
  async searchDetailFallback(
    rawTitle: string,
    type: ContentType,
    country?: string | undefined,
  ): Promise<ContentDetail | null> {
    const cacheKey = `tmdb-fallback:${type}:${country ?? ""}:${rawTitle}`;
    const cached: { detail: ContentDetail | null } | null = cache.get(cacheKey);
    if (cached) return cached.detail;
    let detail: ContentDetail | null = null;
    try {
      detail = await this._searchDetailFallback(rawTitle, type, country);
    } catch (error: any) {
      handleError(error, this.logger, `Fallback search ${rawTitle}`);
      return null; // do not cache errors
    }
    cache.set(cacheKey, { detail }, TTL_MS.content);
    return detail;
  }

  private async _searchDetailFallback(
    rawTitle: string,
    type: ContentType,
    country?: string | undefined,
  ): Promise<ContentDetail | null> {
    const kind = type === "series" ? "tv" : "movie";
    const parsed = parseCatalogTitle(rawTitle, type);
    for (const variant of parsed.variants) {
      const response = await this._getRequest<{
        results: (TmdbTvResult & TmdbMovieResult)[];
      }>(`/search/${kind}`, { query: variant.title, include_adult: true });
      const allowed = (response.results ?? []).slice(0, 8).filter((result) => {
        const date = result.first_air_date || result.release_date || "";
        const year = parseInt(date.slice(0, 4));
        return isCandidateAllowed(
          {
            year: Number.isNaN(year) ? undefined : year,
            originCountry: result.origin_country,
            originalLanguage: result.original_language,
          },
          parsed,
          variant,
          kind,
          country,
        );
      });

      let best: { id: number; score: number } | null = null;
      for (const result of allowed) {
        const names = [
          result.name,
          result.title,
          result.original_name,
          result.original_title,
        ].filter((name): name is string => !!name);
        const score = Math.max(
          ...names.map((name) => titleSimilarity(variant.title, name)),
        );
        if (score >= MIN_TITLE_SIMILARITY && (!best || score > best.score)) {
          best = { id: result.id, score };
        }
      }
      // Weak variants (subtitle dropped) must match the main title.
      if (!best && !variant.weak) {
        for (const result of allowed.slice(0, 5)) {
          const altTitles = await this.getAlternativeTitles(kind, result.id);
          const score = Math.max(
            0,
            ...altTitles.map((alt) => titleSimilarity(variant.title, alt)),
          );
          if (score >= MIN_TITLE_SIMILARITY) {
            best = { id: result.id, score };
            break;
          }
        }
      }
      if (best) {
        this.logger.log(
          `Fallback found | ${rawTitle} -> ${kind} ${best.id} (${variant.title}, ${best.score})`,
        );
        return kind === "tv"
          ? await this.getSeriesDetail(best.id.toString())
          : await this.getMovieDetail(best.id.toString());
      }
    }
    return null;
  }

  private async getAlternativeTitles(
    kind: "tv" | "movie",
    id: number,
  ): Promise<string[]> {
    try {
      const data = await this._getRequest<{
        results?: { title: string }[];
        titles?: { title: string }[];
      }>(`/${kind}/${id}/alternative_titles`);
      return (data.results ?? data.titles ?? [])
        .map((alt) => alt.title)
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async getSearchSeries(title: string, year?: number): Promise<TmdbTvSearch> {
    if (year) {
      const param = { query: title, year: year };
      return await this._getRequest(`/search/tv`, param);
    }
    return await this._getRequest(`/search/tv`, { query: title });
  }

  async searchMovieDetail(
    title: string,
    year?: number,
  ): Promise<ContentDetail | null> {
    try {
      const movieResponse = await this.getSearchMovie(title, year);
      const results = this.getMovies(movieResponse.results);
      const movie = matchTitle(results, title, year)[0];
      if (movie) {
        this.logger.log(
          `Found | ${movie.title} ${movie.year} ${movie.imdbId || ""}`,
        );
        const detail = await this.getMovieDetail(movie.id);
        return detail;
      }
      return null;
    } catch (error: any) {
      handleError(error, this.logger, `Search movie`);
      return null;
    }
  }

  async getSearchMovie(title: string, year?: number): Promise<TmdbMovieSearch> {
    if (year) {
      const param = { query: title, year: year };
      return await this._getRequest(`/search/movie`, param);
    }
    return await this._getRequest(`/search/movie`, { query: title });
  }

  // Find IMDB
  async findDetailImdb(
    imdbId: string,
    type: ContentType,
  ): Promise<ContentDetail | null> {
    if (type === "series") {
      return await this.findSeriesDetail(imdbId);
    } else {
      return await this.findMovieDetail(imdbId);
    }
  }

  async findSeriesDetail(imdbId: string): Promise<ContentDetail | null> {
    try {
      const seriesResponse: TmdbFindResponse = await this._getRequest(
        "/find/" + imdbId,
        {
          external_source: "imdb_id",
        },
      );
      this.logger.debug(JSON.stringify(seriesResponse));
      const series = seriesResponse.tv_results[0];
      if (series) {
        const year = new Date(series.first_air_date).getFullYear();
        return {
          id: imdbId,
          title: series.name,
          overview: series.overview,
          year: year,
          type: "series",
          tmdbId: series.id,
          imdbId: imdbId,
        };
      }

      return null;
    } catch (error: any) {
      handleError(error, this.logger, `Find series`);
      return null;
    }
  }

  async findMovieDetail(imdbId: string): Promise<ContentDetail | null> {
    try {
      const movieResponse: TmdbFindResponse = await this._getRequest(
        "/find/" + imdbId,
        {
          external_source: "imdb_id",
        },
      );
      const movie = movieResponse.movie_results?.[0];

      if (movie) {
        return this.toDetail(movie);
      }

      return null;
    } catch (error: any) {
      handleError(error, this.logger, `Find movie`);
      return null;
    }
  }

  // Get TMDB
  async getDetailTmdb(
    tmdbId: string,
    type: ContentType,
  ): Promise<ContentDetail | null> {
    if (type === "series") {
      return await this.getSeriesDetail(tmdbId);
    } else {
      return await this.getMovieDetail(tmdbId);
    }
  }

  getMovies(movies: TmdbMovieResult[]) {
    return movies.map((movie) => {
      return this.toDetail(movie);
    });
  }

  toDetail(movie: TmdbMovieResult): ContentDetail {
    const year = new Date(movie.release_date).getFullYear();
    const thumbnail = `${this.imageUrl}/t/p/w500${movie.poster_path}`;
    const background = movie.backdrop_path
      ? `${this.imageUrl}/t/p/w500${movie.backdrop_path}`
      : undefined;
    const content: ContentDetail = {
      id: movie.id.toString(),
      title: movie.title,
      overview: movie.overview,
      thumbnail: thumbnail,
      year: year,
      type: "movie",
      tmdbId: movie.id,
    };
    if (background) content.background = background;
    if (movie.imdb_id) content.imdbId = movie.imdb_id;
    return content;
  }

  async getMovieDetail(tmdbId: string): Promise<ContentDetail | null> {
    this.logger.debug(`ID ${tmdbId}`);
    try {
      const movie = await this.getMovieDetailImageExternalId(tmdbId);
      if (!movie) return null;
      const images = movie.images;
      const externalId = movie.external_ids;
      const year = new Date(movie.release_date).getFullYear();
      const thumbnail = `${this.imageUrl}/t/p/w500${movie.poster_path}`;
      const content: ContentDetail = {
        id: movie.id.toString(),
        title: movie.title,
        overview: movie.overview,
        thumbnail: thumbnail,
        year: year,
        type: "movie",
        tmdbId: movie.id,
      };
      if (movie.imdb_id) content.imdbId = movie.imdb_id;
      if (externalId?.imdb_id) content.imdbId = externalId.imdb_id;
      if (externalId?.tvdb_id) content.tvdbId = externalId.tvdb_id;
      const { logo, background } = this.extractLogoAndBackground(images);
      if (logo) content.logo = logo;
      if (background) content.background = background;
      return content;
    } catch (error: any) {
      handleError(error, this.logger, `Get movie details error`);
      return null;
    }
  }

  async getSeriesDetail(tmdbId: string): Promise<ContentDetail | null> {
    this.logger.debug(`ID ${tmdbId}`);
    try {
      const series = await this.getTvDetailImageExternalId(tmdbId);
      if (!series) return null;
      const images = series.images;
      const externalId = series.external_ids;
      const year = new Date(series.first_air_date).getFullYear();
      const thumbnail = `${this.imageUrl}/t/p/w500${series.poster_path}`;
      const content: ContentDetail = {
        id: series.id.toString(),
        title: series.name,
        overview: series.overview,
        year: year,
        type: "series",
        tmdbId: series.id,
        thumbnail: thumbnail,
      };
      if (externalId?.imdb_id) content.imdbId = externalId.imdb_id;
      if (externalId?.tvdb_id) content.tvdbId = externalId.tvdb_id;
      const { logo, background } = this.extractLogoAndBackground(images);
      if (logo) content.logo = logo;
      if (background) content.background = background;
      return content;
    } catch (error: any) {
      handleError(error, this.logger, `Get series details error`);
      return null;
    }
  }

  // Combined request
  async getTvDetailImageExternalId(
    id: string,
  ): Promise<TmdbTvImagesExternalId> {
    return await this._getRequest<TmdbTvImagesExternalId>(
      `/tv/${id}?append_to_response=images,external_ids`,
    );
  }

  async getMovieDetailImageExternalId(
    id: string,
  ): Promise<TmdbMovieImagesExternalId> {
    return await this._getRequest<TmdbMovieImagesExternalId>(
      `/movie/${id}?append_to_response=images,external_ids`,
    );
  }

  extractLogoAndBackground(images?: TmdbTvImages) {
    if (!images) return { logo: "", background: "" };
    const logoPath =
      images.logos.find((logo: any) => logo.iso_639_1 === "en")?.file_path ||
      images.logos[0]?.file_path ||
      "";
    const backdropPath =
      images.backdrops.find((logo: any) => logo.iso_639_1 === "en")
        ?.file_path ||
      images.backdrops[0]?.file_path ||
      "";

    const logo = logoPath ? `${this.imageUrl}/t/p/w500${logoPath}` : "";
    const background = backdropPath
      ? `${this.imageUrl}/t/p/original${backdropPath}`
      : "";
    return { logo, background };
  }

  // Request with auth
  private async _getRequest<T>(
    endpoint: string,
    params: Record<string, any> = {},
  ): Promise<T> {
    const queryParams = new URLSearchParams({
      ...params,
    });
    let url = `${this.baseUrl}${endpoint}`;
    if (queryParams.size > 0) {
      url += `?${queryParams}`;
    }
    url = getProxyUrl(url);
    const config: AxiosRequestConfig = {
      headers: {
        "User-Agent": ENV.USER_AGENT,
        Authorization: "Bearer " + this.apiKey,
        "Content-Type": "application/json",
      },
    };
    this.logger.log(`GET | ${url}`);
    const data = await axiosGet<T>(`${url}`, config);
    if (!data) {
      throw new TmdbError(`[TMDB  ] Not found data ${url}`);
    }
    return data;
  }
}

export const tmdb = new TMDBService(Provider.TMDB);
