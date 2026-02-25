// Docs: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/manifest.md
import { ContentType, Manifest, ManifestCatalog } from "stremio-addon-sdk";
import pkg from "../../package.json" with { type: "json" };
import { Provider } from "../source/provider.js";
import { getOrgin } from "../utils/domain.js";
import { defaultConfig } from "./addon.js";

export interface UserConfig {
  catalog: Provider[];
  stream: Provider[];
}

export enum Prefix {
  IMDB = "tt",
  TMDB = "tmdb",
  TVDB = "tvdb",
  IDRAMA = "idrama",
  KISSKH = "kisskh",
}
const IDRAMA_CATALOG_ID = "idrama";
export const KisskhSearchCatalog = {
  SERIES: `${Prefix.KISSKH}.series.Search`,
  MOVIES: `${Prefix.KISSKH}.movie.Search`,
};
export const KisskhCatalog = {
  // SERIES_NEW: `${Prefix.KISSKH}.series.New`,
  // SERIES_KOREAN: `${Prefix.KISSKH}.series.Korean`,
  // SERIES_CHINESE: `${Prefix.KISSKH}.series.Chinese`,
  SERIES_PHILIPINES: `${Prefix.KISSKH}.series.Philippine`,
  MOVIE_PHILIPINES: `${Prefix.KISSKH}.movie.Philippine`,
  // MOVIE_NEW: `${Prefix.KISSKH}.movie.New`,
  // MOVIE_KOREAN: `${Prefix.KISSKH}.movie.Korean`,
  // MOVIE_CHINESE: `${Prefix.KISSKH}.movie.Chinese`,
};

const catalogMap: Map<Provider, ManifestCatalog[]> = new Map();
catalogMap.set(Provider.IDRAMA, [
  {
    id: IDRAMA_CATALOG_ID,
    name: `[${pkg.name}] iDrama`,
    type: "series",
    extra: [
      { name: "search", isRequired: false },
      { name: "skip", isRequired: false },
    ],
  },
]);

const kisskhSearchCatalogs = Object.entries(KisskhSearchCatalog).map(
  ([key, value]) => {
    const [prefix, type, name] = value.split(".");
    const manifestCatalog: ManifestCatalog = {
      id: value,
      type: type as ContentType,
      name: `[${pkg.name}] ${prefix} ${name}`,
      extra: [
        { name: "skip", isRequired: false, options: ["0", "50"] },
        { name: "search", isRequired: true },
      ],
    };
    return manifestCatalog;
  },
);
const kisskhCatalogs = Object.entries(KisskhCatalog).map(([key, value]) => {
  const [prefix, type, name] = value.split(".");
  const manifestCatalog: ManifestCatalog = {
    id: value,
    type: type as ContentType,
    name: `[${pkg.name}] ${prefix} ${name}`,
    extra: [{ name: "skip", isRequired: false }],
  };
  return manifestCatalog;
});
kisskhCatalogs.push(...kisskhSearchCatalogs);
catalogMap.set(Provider.KISSKH, kisskhCatalogs);

const defaultManifest: Manifest = {
  id: "community.yastream",
  contactEmail: "tamthai.de@gmail.com",
  version: pkg.version,
  catalogs: [],
  resources: ["stream", "subtitles"],
  logo: `${getOrgin()}/img/yas.png`,
  idPrefixes: [
    Prefix.IMDB,
    Prefix.TMDB,
    Prefix.TVDB,
    Prefix.IDRAMA,
    Prefix.KISSKH,
  ],
  types: ["movie", "series"],
  name: "yastream",
  description:
    "Yet Another Stream. Stream asian dramas, series and movies directly with multiple providers. Powered by TMDB and TVDB for metadata",
  behaviorHints: {
    adult: false,
    p2p: false,
    configurable: true,
    configurationRequired: false,
  },
  config: [{ key: "config", type: "text" }],
};

export function buildManifest(config?: UserConfig) {
  config = config || defaultConfig;
  const config64 = btoa(JSON.stringify(config));
  const manifest = { ...defaultManifest };
  manifest.resources = [...defaultManifest.resources];
  manifest.catalogs = [...defaultManifest.catalogs];
  if (config.catalog.length > 0) {
    manifest.resources.push("catalog");
    manifest.resources.push("meta");
    config.catalog.forEach((provider) => {
      const catalog = catalogMap.get(provider);
      if (catalog) {
        manifest.catalogs.push(...catalog);
      }
    });
  }
  manifest.config = [{ key: "config", type: "text", default: config64 }];
  return manifest;
}
