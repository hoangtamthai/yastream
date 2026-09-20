import { ContentType } from "@stremio-addon/sdk";
import { uuidv7 } from "uuidv7";
import {
  getContentByTmdb,
  getContentJoinProviderById,
  getCountProviderContent,
  getProviderContentsById as getMatchContentProvider,
  getProviderContentById,
  upsertContent,
  upsertProviderContent,
} from "../../db/queries.js";
import { Prefix } from "../../lib/manifest.js";
import { ContentDetail, ContentId } from "../../source/meta.js";
import { Provider } from "../../source/provider.js";
import { tmdb } from "../../source/tmdb.js";
import { TTL_MS } from "../../utils/cache.js";
import { extractTitle } from "../../utils/format.js";

class ProviderService {
  static async getProviderContent(id: string) {
    return getProviderContentById(id);
  }

  static async getTotalProviderContent() {
    const count = await getCountProviderContent();
    if (!count) return 0;
    const total = Number(count?.[0]?.count ?? 0);
    return total;
  }

  static async getSameProviderContent(id: string) {
    const dbContentAndProvider = await getMatchContentProvider(id);
    const providerContents = dbContentAndProvider?.providerContent;
    if (
      dbContentAndProvider &&
      providerContents &&
      providerContents.length > 0
    ) {
      return dbContentAndProvider;
    }
    return null;
  }

  static async getContentAndProvider(type: ContentType, contentId: ContentId) {
    const { imdbId, tmdbId, tvdbId, kisskhId, onetouchtvId } = contentId;
    const hasMetaId = imdbId || tmdbId || tvdbId;
    if (hasMetaId) {
      const dbContentAndProvider = await getContentJoinProviderById(
        type,
        imdbId,
        tmdbId,
        tvdbId,
      );
      const providerContents = dbContentAndProvider?.providerContent;
      if (
        dbContentAndProvider &&
        providerContents &&
        providerContents.length > 0
      ) {
        return dbContentAndProvider;
      }
    }
    const hasProviderId = kisskhId || onetouchtvId;
    if (hasProviderId) {
      let id: string | null = null;
      if (kisskhId) {
        id = `${Prefix.KISSKH}:${kisskhId}`;
      }
      if (onetouchtvId) {
        id = `${Prefix.ONETOUCHTV}:${onetouchtvId}`;
      }
      if (!id) return null;
      const dbContentAndProvider =
        await ProviderService.getSameProviderContent(id);
      const providerContents = dbContentAndProvider?.providerContent;
      if (
        dbContentAndProvider &&
        providerContents &&
        providerContents.length > 0
      ) {
        return dbContentAndProvider;
      }
    }
    return null;
  }

  static async getDbContent(
    type: ContentType,
    contentId: ContentId,
    season: number,
  ) {
    let dbContent: ContentDetail | null = null;
    const { imdbId, tmdbId, tvdbId, kisskhId, onetouchtvId, mkvdramaId } =
      contentId;
    const id: string | undefined =
      imdbId ??
      tmdbId?.toString() ??
      tvdbId?.toString() ??
      kisskhId ??
      onetouchtvId ??
      mkvdramaId;
    if (!id) return null;
    const dbContentAndProvider = await ProviderService.getContentAndProvider(
      type,
      contentId,
    );
    if (!dbContentAndProvider) return null;
    const dbProviderContent = dbContentAndProvider.providerContent;
    dbContent = {
      id: id,
      title: dbContentAndProvider.title,
      year: dbContentAndProvider.year,
      type: type,
    };
    if (imdbId) dbContent.imdbId = imdbId;
    if (tmdbId) dbContent.tmdbId = tmdbId;
    if (tvdbId) dbContent.tvdbId = tvdbId;
    if (dbContentAndProvider.imdbId)
      dbContent.imdbId = dbContentAndProvider.imdbId;
    if (dbContentAndProvider.tmdbId)
      dbContent.tmdbId = parseInt(dbContentAndProvider.tmdbId);
    if (dbContentAndProvider.tvdbId)
      dbContent.tvdbId = parseInt(dbContentAndProvider.tvdbId);

    // Set season from the correct provider
    if (kisskhId) {
      dbContent.kisskhId = kisskhId;
      const provider = dbProviderContent.find((providerContent) => {
        return providerContent.externalId === kisskhId;
      });
      if (provider) {
        const extractedTitle = extractTitle(provider.title);
        season = extractedTitle.season ?? 1;
      }
    }
    if (onetouchtvId) {
      dbContent.onetouchtvId = onetouchtvId;
      const provider = dbProviderContent.find((providerContent) => {
        return providerContent.externalId === onetouchtvId;
      });
      if (provider) {
        const extractedTitle = extractTitle(provider.title);
        season = extractedTitle.season ?? 1;
      }
    }
    if (mkvdramaId) {
      dbContent.mkvdramaId = mkvdramaId;
      const provider = dbProviderContent.find((providerContent) => {
        return providerContent.externalId === mkvdramaId;
      });
      if (provider) {
        const extractedTitle = extractTitle(provider.title);
        season = extractedTitle.season ?? 1;
      }
    }
    dbProviderContent.forEach((providerContent) => {
      const extractedTitle = extractTitle(providerContent.title);
      const extractedSeason = extractedTitle.season ?? 1;
      switch (providerContent.provider) {
        case Provider.KISSKH:
          if (!kisskhId && extractedSeason === season) {
            dbContent.kisskhId = providerContent.externalId;
            dbContent.title = providerContent.title;
          }
          break;
        case Provider.ONETOUCHTV:
          if (!onetouchtvId && extractedSeason === season) {
            dbContent.onetouchtvId = providerContent.externalId;
            dbContent.title = providerContent.title;
          }
          break;
        case Provider.MKVDRAMA:
          if (!mkvdramaId && extractedSeason === season) {
            dbContent.mkvdramaId = providerContent.externalId;
            dbContent.title = providerContent.title;
          }
          break;
        default:
          break;
      }
    });
    return dbContent;
  }

  static async syncContentAndProvider(
    content: ContentDetail,
    id: string,
    provider: Provider,
  ) {
    const title = content.title;
    const tmdbDetail = await tmdb.searchDetail(content.title, content.type);
    const image = content.thumbnail ?? tmdbDetail?.thumbnail;
    const providerContentId = `${provider}:${id}`;
    if (!tmdbDetail) return;
    const oldContent = await getContentByTmdb(tmdbDetail.id, content.type);
    let contentId = uuidv7();
    if (oldContent) {
      contentId = oldContent.id;
    } else {
      await upsertContent(contentId, tmdbDetail, TTL_MS.content);
    }
    const providerContent = await getProviderContentById(providerContentId);
    if (providerContent) {
      await upsertProviderContent({
        ...providerContent,
        contentId: contentId,
        title: title,
      });
    } else {
      await upsertProviderContent({
        id: providerContentId,
        contentId: contentId,
        title: title,
        ttl: null,
        provider: provider,
        externalId: id.toString(),
        image: image,
        year: content.year,
        type: content.type,
      });
    }
  }
}

export default ProviderService;
