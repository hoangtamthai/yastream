import {
  CatalogHandlerArgs,
  ContentType,
  MetaDetail,
  MetaPreview,
  Stream,
  Subtitle,
} from "@stremio-addon/sdk";
import { Prefix, UserConfig } from "../lib/manifest.js";
import { ENV } from "../utils/env.js";
import { Logger } from "../utils/logger.js";
import { ContentDetail } from "./meta.js";

export enum Provider {
  KISSKH = "kisskh",
  IDRAMA = "idrama",
  KKPHIM = "kkphim",
  OPHIM = "ophim",
  ONETOUCHTV = "onetouchtv",
  MKVDRAMA = "mkvdrama",
  TMDB = "tmdb",
  TVDB = "tvdb",
}

export abstract class BaseProvider {
  abstract baseUrl: string;
  protected headers: Record<string, string> = {
    "User-Agent": ENV.USER_AGENT,
    Accept: "aplication/json",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
  };
  protected logger: Logger;
  readonly displayName: string;
  name: Provider;
  abstract supportedPrefix: Prefix[];
  nsfwDefaultThumbnail =
    "https://images5.alphacoders.com/432/thumb-1920-432119.jpg";

  constructor(name: Provider) {
    this.name = name;
    this.logger = new Logger(name);
    this.displayName = `${ENV.DISPLAY_NAME}\n${name}`;
  }

  abstract searchCatalog(
    args: CatalogHandlerArgs,
    config: UserConfig,
  ): Promise<MetaPreview[]>;

  abstract getCatalog(
    args: CatalogHandlerArgs,
    config: UserConfig,
  ): Promise<MetaPreview[]>;

  abstract getMeta(
    content: ContentDetail,
    type: ContentType,
  ): Promise<MetaDetail | null>;

  abstract getStreams(
    content: ContentDetail,
    config: UserConfig,
  ): Promise<Stream[]>;

  abstract getSubtitles(content: ContentDetail): Promise<Subtitle[]>;

  /**
   * @param pageSize total items get from all urls called
   * @param skip how much to skip
   * @param urlNum number of urls that get called
   * @returns page from 1
   */
  getPage(pageSize: number, skip?: number, urlNum: number = 1) {
    return skip ? Math.ceil(skip / Math.ceil(pageSize / urlNum)) + 1 : 1;
  }
}
