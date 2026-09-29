import {
  AddonBuilder,
  createRouter,
  MetaDetail,
  MetaPreview,
  ShortManifestResource,
  Stream,
  Subtitle,
} from "@stremio-addon/sdk";
import { rateLimiter } from "hono-rate-limiter";
import {
  buildCatalogHandler,
  buildMetaHandler,
  buildStreamHandler,
  buildSubtitleHandler,
} from "../../lib/addon.js";
import {
  buildManifest,
  defaultConfig,
  UserConfig,
} from "../../lib/manifest.js";
// import app from "../../server.js";
import { Hono } from "hono";
import { getSetDecryptedSubtitle } from "../../source/kisskh-subtitle.js";
import { Provider } from "../../source/provider.js";
import { resourceRatelimit } from "../../utils/analytic/prometheus.js";
import { hashMD5 } from "../../utils/crypto.js";
import { getOrigin } from "../../utils/domain.js";
import { ENV } from "../../utils/env.js";
import { Logger } from "../../utils/logger.js";
import { extractHeaderInfo, getRemainingText } from "./analytics.js";

const logger = new Logger("SERVER");

const stremio = new Hono();

export function getDescription(remaining: number) {
  const description = "Too Many Request\nRetry after";
  getRetryAfterText(remaining);
  return `${description} ${getRetryAfterText(remaining)}`;
}
export function getRetryAfterText(remaining: number) {
  if (remaining < 60) {
    return `${remaining} seconds`;
  } else {
    const minutes = Math.ceil(remaining / 60);
    return `${minutes} minutes`;
  }
}
const getName = () => `⏱️${ENV.DISPLAY_NAME}\nRate Limit`;
const getLimiter = (
  resource: ShortManifestResource,
  windowMs: number = 30 * 60 * 1000,
  limit: number = 30,
) => {
  const limiter = (resource: ShortManifestResource) => {
    return rateLimiter({
      windowMs: windowMs,
      limit: limit,
      keyGenerator: (c) => {
        const { ip } = extractHeaderInfo(c);
        const key = `${ip}`;
        return key;
      },
      handler: (c) => {
        const { ip, userAgent } = extractHeaderInfo(c);
        const remaining = c.res.headers.get("RateLimit-Reset") ?? "5";
        const remainingText = getRemainingText(parseInt(remaining), resource);
        const description = getDescription(parseInt(remaining));
        logger.warn(
          `Rate limit | Resource: ${resource}, IP: ${ip}, Wait: ${remaining}s`,
        );
        const key = hashMD5(`${ip}:${userAgent}`);
        resourceRatelimit?.inc({
          resource,
          key,
          wait: remainingText,
        });
        const limitResponse = getResourceLimitResponse(resource, description);
        return c.json({ ...limitResponse, retryAfter: remaining }, 200);
      },
    });
  };
  return limiter(resource);
};
function getResourceLimitResponse(
  resource: ShortManifestResource,
  description: string,
) {
  let limitResponse = {};
  switch (resource) {
    case "catalog":
      const catalogLimit: { metas: MetaPreview[] } = {
        metas: [
          {
            id: "catalog.ratelimit",
            type: "series",
            name: getName(),
            description: description,
          },
        ],
      };
      limitResponse = catalogLimit;
      break;
    case "meta":
      const metaLimit: { meta: MetaDetail } = {
        meta: {
          id: "meta.ratelimit",
          type: "series",
          name: getName(),
          description: description,
        },
      };
      limitResponse = metaLimit;
      break;
    case "stream":
      const streamsLimit: { streams: Stream[] } = {
        streams: [
          {
            name: getName(),
            description: description,
            externalUrl: getOrigin(),
          },
        ],
      };
      limitResponse = streamsLimit;
      break;
    case "subtitles":
      const subtitlesLimit: { subtitles: Subtitle[] } = {
        subtitles: [
          {
            label: description,
            id: "subtitles.ratelimit",
            url: getOrigin(),
            lang: "eng",
          },
        ],
      };
      limitResponse = subtitlesLimit;
      break;
    default:
      limitResponse = { description: description };
      break;
  }
  return limitResponse;
}
const catalogLimiter = getLimiter(
  "catalog",
  ENV.CATALOG_WINDOW_MINUTES * 60 * 1000,
  ENV.CATALOG_REQUEST_LIMIT,
);
const metaLimiter = getLimiter(
  "meta",
  ENV.META_WINDOW_MINUTES * 60 * 1000,
  ENV.META_REQUEST_LIMIT,
);
const streamLimiter = getLimiter(
  "stream",
  ENV.STREAM_WINDOW_MINUTES * 60 * 1000,
  ENV.STREAM_REQUEST_LIMIT,
);
const subtitlesLimiter = getLimiter(
  "subtitles",
  ENV.SUBTITLES_WINDOW_MINUTES * 60 * 1000,
  ENV.SUBTITLES_REQUEST_LIMIT,
);

// Handle config routes
stremio.get("/manifest.json", (c) => {
  const manifest = buildManifest();
  return c.json(manifest);
});
stremio.get("/:configBase64/manifest.json", (c) => {
  const configBase64 = c.req.param("configBase64");
  const config = decodeConfig(configBase64);
  const manifest = buildManifest(config);
  return c.json(manifest);
});

// Stremio addon routes handler
export interface RouteConfig {
  route: string;
  limiter: ReturnType<typeof rateLimiter>;
}
const stremioRouteConfigs: RouteConfig[] = [
  { route: "/catalog/*", limiter: catalogLimiter },
  { route: "/meta/*", limiter: metaLimiter },
  { route: "/stream/*", limiter: streamLimiter },
  { route: "/subtitles/*", limiter: subtitlesLimiter },
];
stremioRouteConfigs.forEach((config) => {
  stremio.use(config.route, config.limiter);
  stremio.get(config.route, async (c) => {
    const defaultManifest = buildManifest();
    const builder = new AddonBuilder(defaultManifest);
    builder.defineCatalogHandler(async (args) => {
      return await buildCatalogHandler(args);
    });
    builder.defineMetaHandler(async (args) => {
      return await buildMetaHandler(args);
    });
    builder.defineStreamHandler(async (args) => {
      return await buildStreamHandler(args);
    });
    builder.defineSubtitlesHandler(async (args) => {
      return await buildSubtitleHandler(args);
    });
    const addonRouter = createRouter(builder.getInterface());
    const response = await addonRouter(c.req.raw);
    if (response) {
      c.header(
        "Cache-Control",
        response.headers.get("Cache-Control") || "no-cache",
      );
    }
    return response || c.notFound();
  });
});

export const decodeConfig = (configBase64: string): UserConfig => {
  try {
    const decoded = Buffer.from(configBase64, "base64").toString("utf-8");
    logger.debug(`Config | ${decoded}`);
    const config: UserConfig = JSON.parse(decoded);
    // TODO clean up when migrate all user
    config.catalog = config.catalog.map((id) => id.toLowerCase() as Provider);
    config.stream = config.stream.map((id) => id.toLowerCase() as Provider);
    return config;
  } catch (error) {
    logger.error(`Fail parse config | ${error}`);
    return defaultConfig;
  }
};

const configStremioRoutes: RouteConfig[] = [
  { route: "/:configBase64/catalog/*", limiter: catalogLimiter },
  { route: "/:configBase64/meta/*", limiter: metaLimiter },
  { route: "/:configBase64/stream/*", limiter: streamLimiter },
  { route: "/:configBase64/subtitles/*", limiter: subtitlesLimiter },
];
configStremioRoutes.forEach((route) => {
  stremio.use(route.route, route.limiter);
  stremio.get(route.route, async (c) => {
    const configBase64 = c.req.param("configBase64") as string;
    const config = decodeConfig(configBase64);
    const manifest = buildManifest(config);
    const builder = new AddonBuilder(manifest);
    if (manifest.resources.includes("catalog")) {
      builder.defineCatalogHandler(async (args) => {
        return await buildCatalogHandler(args, config);
      });
    }
    if (
      manifest.resources.includes("meta") ||
      manifest.resources.some(
        (r) => typeof r === "object" && "name" in r && r.name === "meta",
      )
    ) {
      builder.defineMetaHandler(async (args) => {
        return await buildMetaHandler(args, config);
      });
    }
    if (manifest.resources.includes("stream")) {
      builder.defineStreamHandler(async (args) => {
        return await buildStreamHandler(args, config);
      });
    }
    if (manifest.resources.includes("subtitles")) {
      builder.defineSubtitlesHandler(async (args) => {
        return await buildSubtitleHandler(args, config);
      });
    }
    const customRouter = createRouter(builder.getInterface());
    const response = await customRouter(c.req.raw);
    if (response) {
      c.header(
        "Cache-Control",
        response.headers.get("Cache-Control") || "no-cache",
      );
    }
    return response || c.notFound();
  });
});

// Serve decrypted subtitles
stremio.get("/subtitle/:url{.*}", async (c) => {
  const encodedUrl = c.req.param("url");

  try {
    const decryptedSubtitle = await getSetDecryptedSubtitle(encodedUrl);
    if (decryptedSubtitle) {
      return c.text(decryptedSubtitle, 200, {
        "Content-Type": "text/vtt; charset=utf-8;",
        "Access-Control-Allow-Origin": "*",
      });
    } else {
      logger.error(`Missing decrypted subtitle | ${encodedUrl}`);
      return c.text("Subtitle not found or decryption failed", 404);
    }
  } catch (error) {
    logger.error(`Fail decrypted subtitle | ${error}`);
    return c.text("Invalid subtitle URL", 400);
  }
});

export default stremio;
