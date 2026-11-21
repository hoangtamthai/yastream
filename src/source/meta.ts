import { ContentType } from "@stremio-addon/sdk";
import { Logger } from "../utils/logger.js";
import { Provider } from "./provider.js";

export interface ContentDetail extends ContentId {
  id: string;
  title: string;
  altTitle?: string;
  overview?: string;
  year: number;
  type: ContentType;
  season?: number;
  episode?: number;
  thumbnail?: string;
  background?: string;
  logo?: string;
}
export interface ContentId {
  imdbId?: string;
  tmdbId?: number;
  tvdbId?: number;
  kisskhId?: string;
  onetouchtvId?: string;
  asiantvId?: string;
  idramaId?: string;
  mkvdramaId?: string;
}

export abstract class BaseMeta {
  name: Provider;
  logger: Logger;
  constructor(name: Provider) {
    this.name = name;
    this.logger = new Logger(name);
  }
}
