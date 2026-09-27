import {
  AddonCatalogHandlerArgs,
  Cache,
  CatalogHandlerArgs,
  MetaDetail,
  MetaHandlerArgs,
  MetaPreview,
  ShortManifestResource,
  Stream,
  StreamHandlerArgs,
  Subtitle,
  SubtitlesHandlerArgs,
} from "@stremio-addon/sdk";
import {
  getProviderContentById,
  upsertProviderContent,
} from "../db/queries.js";
import { EProviderContent } from "../db/schema/provider_content.js";
import { registerMkvdramaJobRunner, startCronJob } from "../service/job/job.js";
import ProviderService from "../service/provider/provider-service.js";
import { IDramaScraper } from "../source/idrama.js";
import { KissKHScraperr } from "../source/kisskh.js";
import { KkphimScraper } from "../source/kkphim.js";
import { ContentDetail } from "../source/meta.js";
import { MkvdramaScraper } from "../source/mkvdrama.js";
import { OnetouchtvScrapper } from "../source/onetouchtv.js";
import { OphimScraper } from "../source/ophim.js";
import { BaseProvider, Provider } from "../source/provider.js";
import { tmdb } from "../source/tmdb.js";
import { tvdb } from "../source/tvdb.js";
import { cache, TTL_MS, TTL_SECS } from "../utils/cache.js";
import { extractTitle } from "../utils/format.js";
import { Logger } from "../utils/logger.js";
import { defaultConfig, Prefix, UserConfig } from "./manifest.js";

const kisskh = new KissKHScraperr(Provider.KISSKH);
const idrama = new IDramaScraper(Provider.IDRAMA);
const kkphim = new KkphimScraper(Provider.KKPHIM);
const ophim = new OphimScraper(Provider.OPHIM);
const onetouchtv = new OnetouchtvScrapper(Provider.ONETOUCHTV);
const mkvdrama = new MkvdramaScraper(Provider.MKVDRAMA);
registerMkvdramaJobRunner(mkvdrama);
startCronJob();
const providers: BaseProvider[] = [
  kisskh,
  onetouchtv,
  idrama,
  kkphim,
  ophim,
  mkvdrama,
];
const providersMap = new Map<Provider, BaseProvider>();
providers.forEach((provider) => {
  providersMap.set(provider.name, provider);
});
const logger = new Logger("ADDON");

async function getContent(
  args: SubtitlesHandlerArgs | CatalogHandlerArgs,
): Promise<ContentDetail | null> {
  switch (true) {
    case args.id.startsWith(Prefix.IMDB): {
      // imdb | tt0000:season:episode
      const [imdbId, season, episode] = args.id.split(":");
      if (!imdbId) {
        return null;
      }
      const contentType = args.type === "series" ? "series" : "movie";
      const contentKey = `content:imdb:${imdbId}`;
      const cacheContent = cache.get(contentKey);
      let content: ContentDetail | null = cacheContent;
      // Get from DB
      if (!content) {
        const dbContent = await ProviderService.getDbContent(
          contentType,
          { imdbId },
          parseInt(season ?? "1"),
        );
        if (dbContent) {
          content = dbContent;
          content.imdbId = imdbId;
        }
      }
      // Get from TMDB
      if (!content) {
        // Get from tmdb
        content = await tmdb.findDetailImdb(imdbId, contentType);
        if (content) {
          cache.set(contentKey, content, TTL_MS.content);
        }
      }
      if (!content) {
        logger.warn(`No TMDB found with IMDB ${imdbId}`);
        return null;
      }
      if (season) content.season = parseInt(season);
      if (episode) content.episode = parseInt(episode);
      return content;
    }
    case args.id.startsWith(Prefix.TMDB): {
      // tmdb | tmdb:movieId
      // tmdb | tmdb:seriesId:season:episode
      const [prefix, tmdbId, season, episode] = args.id.split(":");
      if (!tmdbId) {
        return null;
      }
      const contentType = args.type === "series" ? "series" : "movie";
      const contentKey = `content:tmdb:${tmdbId}`;
      const cacheContent = cache.get(contentKey);
      let content: ContentDetail | null = cacheContent;
      if (!content) {
        const dbContent = await ProviderService.getDbContent(
          contentType,
          { tmdbId: parseInt(tmdbId) },
          parseInt(season ?? "1"),
        );
        content = dbContent ? dbContent : null;
      }
      if (!content) {
        content = await tmdb.getDetailTmdb(tmdbId, contentType);
        if (content) cache.set(contentKey, content, TTL_MS.content);
      }
      if (!content) {
        // TMDB get from TMDB must return
        logger.error(`Not found TMDB ${tmdbId}`);
        return null;
      }
      if (season) content.season = parseInt(season);
      if (episode) content.episode = parseInt(episode);
      return content;
    }
    case args.id.startsWith(Prefix.TVDB): {
      // tvdb | tvdb:movieId
      // tvdb | tvdb:seriesId:season:episode
      const [prefix, tvdbId, season, episode] = args.id.split(":");
      if (!tvdbId) {
        return null;
      }
      const contentType = args.type === "series" ? "series" : "movie";
      const contentKey = `content:tvdb:${tvdbId}`;
      const cacheContent = cache.get(contentKey);
      let content: ContentDetail | null = cacheContent;
      if (!content) {
        const dbContent = await ProviderService.getDbContent(
          contentType,
          { tvdbId: parseInt(tvdbId) },
          parseInt(season ?? "1"),
        );
        content = dbContent ? dbContent : null;
      }
      if (!content) {
        content = await tvdb.getDetailTvdb(tvdbId, contentType);
        if (content) cache.set(contentKey, content, TTL_MS.content);
      }
      if (!content) {
        logger.error(`Not found TVDB ${tvdbId}`);
        return null;
      }
      if (season) content.season = parseInt(season);
      if (episode) content.episode = parseInt(episode);
      return content;
    }
    case args.id.startsWith(Prefix.IDRAMA): {
      // id | idrama:postId:season:episode
      const [prefix, idramaId, season, episode] = args.id.split(":");
      if (!idramaId) return null;
      const contentKey = `content:idrama:${idramaId}`;
      const cacheContent = cache.get(contentKey);
      let content: ContentDetail | null = cacheContent;
      if (!content) {
        const detail = await idrama.getStreamDetail(idramaId);
        if (!detail) return null;
        const { title, year } = detail;
        content = {
          id: idramaId,
          idramaId: idramaId,
          title: title,
          year: year,
          type: args.type,
          season: season ? parseInt(season) : 1,
          episode: episode ? parseInt(episode) : 1,
        };
        if (content) cache.set(contentKey, content, TTL_MS.content);
      }
      if (!content) {
        logger.error(`Not found IDrama ${idramaId}`);
        return null;
      }
      if (season) content.season = parseInt(season);
      if (episode) content.episode = parseInt(episode);
      return content;
    }
    case args.id.startsWith(Prefix.KISSKH): {
      // id | kisskh:episodeId:season:episode
      const [prefix, kisskhId, season, episode] = args.id.split(":");
      if (!kisskhId) return null;
      const contentType = args.type === "series" ? "series" : "movie";
      const contentKey = `content:kisskh:${kisskhId}`;
      const cacheContent = cache.get(contentKey);
      let content: ContentDetail | null = cacheContent;
      if (!content) {
        const dbContent = await ProviderService.getDbContent(
          contentType,
          { kisskhId },
          parseInt(season ?? "1"),
        );
        if (dbContent) {
          logger.log(`Found DB content ${contentKey}`);
          content = dbContent;
        }
      }
      if (!content) {
        const providerContent = await getProviderContentById(
          `${prefix}:${kisskhId}`,
        );
        if (providerContent) {
          content = {
            id: kisskhId,
            kisskhId: kisskhId,
            type: args.type,
            title: providerContent.title,
            year: providerContent.year,
            season: season ? parseInt(season) : 1,
            episode: episode ? parseInt(episode) : 1,
          };
        } else {
          const { title, releaseDate, thumbnail } =
            await kisskh.getDetail(kisskhId);
          const extracted = extractTitle(title);
          const pureTitle = extracted.title;
          const year = extracted.year || new Date(releaseDate).getFullYear();
          content = {
            id: kisskhId,
            kisskhId: kisskhId,
            type: args.type,
            title: pureTitle,
            year: year,
            season: season ? parseInt(season) : 1,
            episode: episode ? parseInt(episode) : 1,
          };
          const newProviderContent: Omit<
            EProviderContent,
            "createdAt" | "updatedAt"
          > = {
            ...content,
            id: `${Prefix.KISSKH}:${kisskhId}`,
            contentId: null,
            provider: Provider.KISSKH,
            externalId: kisskhId,
            image: thumbnail,
            ttl: TTL_MS.content,
          };
          upsertProviderContent(newProviderContent);
        }
        cache.set(contentKey, content, TTL_MS.content);
      }
      if (!content) {
        logger.error(`Not found kisskh ${kisskhId}`);
        return null;
      }
      content.season = season ? parseInt(season) : 1;
      content.episode = episode ? parseInt(episode) : 1;
      return content;
    }
    case args.id.startsWith(Prefix.ONETOUCHTV): {
      // id | onetouchtv:detailId:season:episode
      const [prefix, onetouchtvId, season, episode] = args.id.split(":");
      if (!onetouchtvId) return null;
      const contentKey = `content:onetouchtv:${onetouchtvId}`;
      const contentType = args.type === "series" ? "series" : "movie";
      const cacheContent = cache.get(contentKey);
      let content: ContentDetail | null = cacheContent;
      if (!content) {
        const dbContent = await ProviderService.getDbContent(
          contentType,
          { onetouchtvId },
          parseInt(season ?? "1"),
        );
        content = dbContent ? dbContent : null;
      }
      if (!content) {
        const providerContent = await getProviderContentById(
          `${prefix}:${onetouchtvId}`,
        );
        if (providerContent) {
          content = {
            id: onetouchtvId,
            onetouchtvId: onetouchtvId,
            type: args.type,
            title: providerContent.title,
            year: providerContent.year,
            season: season ? parseInt(season) : 1,
            episode: episode ? parseInt(episode) : 1,
          };
        } else {
          const { title, year, image } = (
            await onetouchtv.getDetail(onetouchtvId)
          ).result;
          const extracted = extractTitle(title);
          const pureTitle = extracted.title;
          const yearFormat = extracted.year || parseInt(year);
          content = {
            id: onetouchtvId,
            onetouchtvId: onetouchtvId,
            title: pureTitle,
            year: yearFormat,
            type: args.type,
            season: season ? parseInt(season) : 1,
            episode: episode ? parseInt(episode) : 1,
          };
          const providerContent: Omit<
            EProviderContent,
            "createdAt" | "updatedAt"
          > = {
            ...content,
            id: `${Provider.ONETOUCHTV}:${onetouchtvId}`,
            contentId: null,
            provider: Provider.ONETOUCHTV,
            externalId: onetouchtvId,
            image: image,
            ttl: TTL_MS.content,
          };
          upsertProviderContent(providerContent);
        }
        cache.set(contentKey, content, TTL_MS.content);
      }
      if (!content) {
        logger.error(`Not found onetouchtv ${onetouchtvId}`);
        return null;
      }
      content.season = season ? parseInt(season) : 1;
      content.episode = episode ? parseInt(episode) : 1;
      return content;
    }
    case args.id.startsWith(Prefix.MKVDRAMA): {
      // id | mkvdrama:detailId:season:episode
      const [prefix, mkvdramaId, season, episode] = args.id.split(":");
      if (!mkvdramaId) return null;
      const contentKey = `content:${Provider.MKVDRAMA}:${mkvdramaId}`;
      const contentType = args.type === "series" ? "series" : "movie";
      const cacheContent = cache.get(contentKey);
      let content: ContentDetail | null = cacheContent;
      if (!content) {
        const dbContent = await ProviderService.getDbContent(
          contentType,
          { mkvdramaId },
          parseInt(season ?? "1"),
        );
        content = dbContent ? dbContent : null;
      }
      if (!content) {
        const providerContent = await getProviderContentById(
          `${prefix}:${mkvdramaId}`,
        );
        if (providerContent) {
          content = {
            id: mkvdramaId,
            mkvdramaId,
            type: args.type,
            title: providerContent.title,
            year: providerContent.year,
            season: season ? parseInt(season) : 1,
            episode: episode ? parseInt(episode) : 1,
          };
        } else {
          const detail = await mkvdrama.getDetailAndEpisodes(mkvdramaId);
          if (!detail) return null;
          const { name, released, poster } = detail.detail;
          const title = name;
          const year = released
            ? new Date(released).getFullYear().toString()
            : new Date().getFullYear().toString();
          const extracted = extractTitle(title);
          const pureTitle = extracted.title;
          const yearFormat = extracted.year || parseInt(year);
          content = {
            id: mkvdramaId,
            mkvdramaId,
            title: pureTitle,
            year: yearFormat,
            type: args.type,
            season: season ? parseInt(season) : 1,
            episode: episode ? parseInt(episode) : 1,
          };
          const providerContent: Omit<
            EProviderContent,
            "createdAt" | "updatedAt"
          > = {
            ...content,
            id: `${Provider.MKVDRAMA}:${mkvdramaId}`,
            contentId: null,
            provider: Provider.MKVDRAMA,
            externalId: mkvdramaId,
            image: poster || null,
            ttl: TTL_MS.content,
          };
          upsertProviderContent(providerContent);
        }
        cache.set(contentKey, content, TTL_MS.content);
      }
      if (!content) {
        logger.error(`Not found mkvdrama ${mkvdramaId}`);
        return null;
      }
      content.season = season ? parseInt(season) : 1;
      content.episode = episode ? parseInt(episode) : 1;
      return content;
    }
  }
  return null;
}

export async function buildCatalogHandler(
  args: AddonCatalogHandlerArgs,
  config: UserConfig = defaultConfig,
): Promise<{ metas: MetaPreview[] } & Cache> {
  // id | kisskh.movie.Korean
  // id | idrama
  logger.log(`Catalog | ${args.id}`);
  try {
    const { id, type } = args;
    const { skip, search } = args.extra;
    const catalogKey = `catalog:${type}:${id}:${skip}:${search}:${config.nsfw}:${config.poster}`;
    const cacheCatalog = cache.get(catalogKey);
    if (cacheCatalog) return cacheCatalog;
    const filteredProviders = filterProvider(providers, id, config, "catalog");
    const [prefix] = id.split(".");
    if (!prefix) {
      return { metas: [] };
    }
    const providerName = prefix as Provider;
    const provider = providersMap.get(providerName);
    if (!provider) {
      logger.error(`No provider found for prefix ${prefix}`);
      return { metas: [] };
    }
    if (!filteredProviders.includes(provider)) {
      logger.error(`Provider ${providerName} is not selected`);
      return { metas: [] };
    }
    const metas = search
      ? await provider.searchCatalog(args, config)
      : await provider.getCatalog(args, config);
    const metaPreviews: { metas: MetaPreview[] } & Cache = { metas: metas };
    if (metas.length > 0) {
      metaPreviews.cacheMaxAge = 2 * 60 * 60;
      cache.set(catalogKey, metaPreviews, 4 * 60 * 60 * 1000);
    }
    return metaPreviews;
  } catch (error) {
    logger.error(`Catalog handler error: ${error}`);
    return { metas: [] };
  }
}

export async function buildMetaHandler(
  args: MetaHandlerArgs,
  config: UserConfig = defaultConfig,
): Promise<{ meta: MetaDetail } & Cache> {
  logger.log(`Meta | ${args.id}`);
  const { id, type } = args;
  const metaKey = `meta:${type}:${id}`;
  const cacheMeta = cache.get(metaKey);
  if (cacheMeta) return cacheMeta;

  const defaultMeta: { meta: MetaDetail } & Cache = {
    meta: {
      id: args.id,
      type: args.type,
      name: "Error getting meta. Please try again later.",
    },
  };
  try {
    const content = await getContent(args);
    if (!content) return defaultMeta;

    const [prefix] = args.id.split(":");
    if (!prefix) {
      return defaultMeta;
    }
    const filteredProviders = filterProvider(
      providers,
      args.id,
      config,
      "meta",
    );
    const provider = providersMap.get(prefix as Provider);
    if (!provider) {
      logger.error(`No meta provider found for prefix ${prefix}`);
      return defaultMeta;
    }
    if (!filteredProviders.includes(provider)) {
      logger.error(`Meta provider ${prefix} is not selected`);
      return defaultMeta;
    }
    const meta = defaultMeta;
    const detail = await provider.getMeta(content, args.type);
    if (detail) {
      meta.meta = detail;
      meta.cacheMaxAge = 1 * 60 * 60;
      cache.set(metaKey, meta, 4 * 60 * 60 * 1000);
    }
    return meta;
  } catch (error) {
    logger.error(`Meta handler error: ${error}`);
    return defaultMeta;
  }
}

export async function buildStreamHandler(
  args: StreamHandlerArgs,
  config: UserConfig = defaultConfig,
): Promise<{ streams: Stream[] } & Cache> {
  logger.log(`Stream | ${args.id}`);
  try {
    const streamKey = `streams:${args.type}:${args.id}:${JSON.stringify(config.stream)}:${config.info}:${config.tbKey}:${config.mfpUrl}:${config.mfpPass}`;
    const cacheStreams = cache.get(streamKey);
    if (cacheStreams) return cacheStreams;
    const content = await getContent(args);
    if (!content) {
      return { streams: [] };
    }
    const filteredProviders = filterProvider(
      providers,
      args.id,
      config,
      "stream",
    );
    const streams = (
      await Promise.all(
        filteredProviders.map(async (provider) => {
          return await provider.getStreams(content, config);
        }),
      )
    ).flat();
    const notDone = streams.some((stream) => stream.url == undefined);
    const streamResults: { streams: Stream[] } & Cache = {
      streams: streams,
    };
    if (streams.length > 0 && !notDone) {
      streamResults.cacheMaxAge = 1 * 60 * 60;
      cache.set(streamKey, streamResults, TTL_MS.stream);
    }
    return streamResults;
  } catch (error) {
    logger.error(`Streams handler error: ${error}`);
    return { streams: [] };
  }
}

export async function buildSubtitleHandler(
  args: SubtitlesHandlerArgs,
  config: UserConfig = defaultConfig,
): Promise<{ subtitles: Subtitle[] } & Cache> {
  logger.log(`Subtitles | ${args.id}`);
  try {
    const { id, type } = args;
    const subtitleKey = `subtitles:${type}:${id}:${JSON.stringify(config.stream)}`;
    const cacheAllSubtitles = cache.get(subtitleKey);
    if (cacheAllSubtitles) return cacheAllSubtitles;
    const content = await getContent(args);
    if (content == null) {
      return { subtitles: [] };
    }
    const { season, episode } = content;
    const filteredProviders = filterProvider(
      providers,
      id,
      config,
      "subtitles",
    );
    const results = await Promise.allSettled(
      filteredProviders.map(async (provider) => {
        const providerSubtitleKey = `subtitles:${type}:${provider.name}:${content.id}:${season}:${episode}`;
        const cacheSubtitles: Subtitle[] = cache.get(providerSubtitleKey);
        if (cacheSubtitles) return cacheSubtitles;
        const providerSubtitles = await provider.getSubtitles(content);
        if (providerSubtitles) return providerSubtitles;
        return [];
      }),
    );
    const subsResults = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value)
      .flat();
    const subtitleResults: { subtitles: Subtitle[] } & Cache = {
      subtitles: subsResults.flat(),
    };
    if (subsResults.length > 0) {
      subtitleResults.cacheMaxAge = TTL_SECS.stream;
      cache.set(subtitleKey, subtitleResults, TTL_MS.stream);
    }
    return subtitleResults;
  } catch (error) {
    logger.error(`Subtitles handler error: ${error}`);
    return { subtitles: [] };
  }
}

function filterProvider(
  providers: BaseProvider[],
  id: string,
  config: UserConfig,
  resource: ShortManifestResource,
) {
  let configResource: Provider[] = [];
  if (resource === "catalog" || resource === "meta") {
    configResource = config.catalog;
  } else if (resource === "stream" || resource === "subtitles") {
    configResource = config.stream;
  }
  return providers.filter((provider) => {
    return (
      configResource.includes(provider.name) &&
      provider.supportedPrefix.some((prefix) => {
        return id.startsWith(prefix);
      })
    );
  });
}
