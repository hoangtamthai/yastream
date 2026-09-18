import { z } from "zod";
const envSchema = z.object({
  // REQUIRED
  TMDB_API_KEY: z.string().min(1, "TMDB_API_KEY is required"),

  // OPTIONAL with Defaults
  DISPLAY_NAME: z.string().default("yastream"),
  // Mediaflow (Optional - can be empty strings)
  MEDIAFLOW_PROXY_URL: z.url().or(z.literal("")).optional(),
  MEDIAFLOW_PROXY_PASSWORD: z.string().optional().default(""),
  // Min title matching score (higher mean only very similar title matches)
  MIN_MATCHING_SCORE: z.coerce.number().min(0).max(100).default(75),
  MATCH_IGNORES: z
    .string()
    .transform((str) => JSON.parse(str))
    .pipe(z.array(z.url()))
    .default(["uncut", "uncut version", "uncut ver."]),

  // Optional key
  TVDB_API_KEY: z.string().default(""),
  TMDB_KEY: z.string().default(""),
  RPDB_API_KEY: z.string().default("t0-free-rpdb-rounded-blocks"),
  DEBUG_KEY: z.string().default("debug-key"),

  // Server configuration
  DOMAIN: z.string().default("localhost"),
  PORT: z.coerce.number().default(55913),
  CACHE_SIZE_MB: z.coerce.number().default(100),
  // Retry configuration
  RETRY_ATTEMPTS: z.coerce.number().default(2),
  RETRY_TIMEOUT_MS: z.coerce.number().default(7000),
  RETRY_DELAY_MS: z.coerce.number().default(5000),
  RETRY_JITTER_MS: z.coerce.number().default(500),
  LOG_LEVEL: z
    .enum(["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "NONE"])
    .default("INFO"),
  // Cache warming
  WARM_CACHE: z.coerce.boolean().default(true),
  // Rate limit
  CATALOG_WINDOW_MINUTES: z.coerce.number().default(10),
  CATALOG_REQUEST_LIMIT: z.coerce.number().default(20),
  META_WINDOW_MINUTES: z.coerce.number().default(10),
  META_REQUEST_LIMIT: z.coerce.number().default(20),
  STREAM_WINDOW_MINUTES: z.coerce.number().default(10),
  STREAM_REQUEST_LIMIT: z.coerce.number().default(10),
  SUBTITLES_WINDOW_MINUTES: z.coerce.number().default(10),
  SUBTITLES_REQUEST_LIMIT: z.coerce.number().default(10),
  REDIRECT_WINDOW_MINUTES: z.coerce.number().default(180),
  REDIRECT_REQUEST_LIMIT: z.coerce.number().default(200),

  // Analytics
  UMAMI_ENABLED: z.coerce.boolean().default(false),
  UMAMI_WEBSITE_ID: z.string().default("f4af25ed-caf9-4fe2-ae07-7f0d50f5a51c"),
  UMAMI_URL: z.url().default("https://umami-fs.tamthai.de"),
  PROMETHEUS_ENABLED: z.coerce.boolean().default(false),

  // Notification
  NTFY_URL: z.url().default(""),

  // Database (optional - only used when DATABASE_ENABLED is true)
  DATABASE_ENABLED: z.coerce.boolean().default(false),
  // Postgres connection string, e.g. postgresql://user:pass@host/db?sslmode=require (Neon/Supabase/self-hosted)
  DATABASE_URL: z.string().default(""),
  // Legacy libsql auth tokens - ignored with Postgres, kept so old .env files still parse
  DATABASE_WRITE_TOKEN: z.string().default(""),
  DATABASE_READ_TOKEN: z.string().default(""),
  DATABASE_SUPPORTER_URL: z.string().default(""),
  DATABASE_SUPPORTER_WRITE_TOKEN: z.string().default(""),

  // FlareSolverr
  FLARESOLVERR_URL: z.string().default(""),
  FLARESOLVERR_AUTH_HEADER: z.string().default(""),
  FLARESOLVERR_MAX_TIMEOUT: z.coerce.number().default(30000),
  FLARESOLVERR_WAIT_IN_SECONDS: z.coerce.number().default(4),

  // Puppeteer
  PUPPETEER_WS_ENDPOINT: z.string().default(""),
  PUPPETEER_AUTH_HEADER: z.string().default(""),
  PUPPETEER_TIMEOUT_MS: z.coerce.number().default(20000),

  // Proxy
  PROXY_URL: z.string().default(""),
  PROXY_PORT: z.coerce.number().default(443),
  PROXY_USERNAME: z.string().default(""),
  PROXY_PASSWORD: z.string().default(""),
  PROXY_TMDB: z.coerce.boolean().default(false),
  PROXY_KISSKH_SUBTITLE: z.coerce.boolean().default(false),
  PROXY_WEBSHARE_URL: z.string().default(""),
  PROXY_WEBSHARE_PORT: z.coerce.number().default(80),
  PROXY_WEBSHARE_USERNAME: z.string().default(""),
  PROXY_WEBSHARE_PASSWORD: z.string().default(""),

  // Job
  JOB_ENABLED: z.coerce.boolean().default(false),
  JOB_CRON: z.string().default(`*/30 * * * * *`),
  // JOB_SCRAPE_CRON: z.string().default(`* */1 * * * *`),

  // Debrid service
  TORBOX_TIMEOUT_MS: z.coerce.number().default(10000),

  // Hoster
  GOFILE_TOKEN: z.string().default(""),

  // Kisskh domains
  KISSKH_URLS: z
    .string()
    .transform((str) => JSON.parse(str))
    .pipe(z.array(z.url()))
    .default(["https://kisskh.co", "https://kisskh.do"]),
  KISSKH_USE_FLARESOLVERR: z.coerce.boolean().default(false),

  // Mkvdrama
  MKVDRAMA_URL: z.string().default("https://mkvdrama.net"),
});

// Validate process.env
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(`Invalid .env`, z.treeifyError(parsed.error).properties);
  process.exit(1);
}

export const ENV = parsed.data;
