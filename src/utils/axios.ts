import axios, {
  AxiosError,
  AxiosProxyConfig,
  AxiosRequestConfig,
  HttpStatusCode,
  RawAxiosRequestHeaders,
} from "axios";
import EventEmitter from "events";
import https from "https";
import { GOFILE_API_ORIGIN, GOFILE_ORIGIN } from "../source/hoster/gofile.js";
import { MKVDRAMA_ORIGIN } from "../source/mkvdrama.js";
import { decryptString } from "../source/onetouchtv-crypto.js";
import { DECRYPTIT_HOST, DECRYPTIT_ORIGIN } from "../source/web/decryptit.js";
import { FILECRYPT_ORIGIN } from "../source/web/filecrypt.js";
import { VIEWCRATE_ORIGIN } from "../source/web/viewcrate.js";
import { FlareSolverrCookie, getFlareSolverr } from "./browser/flaresolverr.js";
import { cache, TTL_MS } from "./cache.js";
import { ONETOUCHTV_ORIGIN, USER_AGENT } from "./constant.js";
import { ENV } from "./env.js";
import { FlareSolverrError, RateLimitError } from "./error.js";
import { Logger } from "./logger.js";
import { getWebshareProxyConfig } from "./proxy/webshare.js";

// process.setMaxListeners(20);
EventEmitter.defaultMaxListeners = 23;
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 20,
  maxFreeSockets: 10,
  timeout: 60000,
});

function createClient(
  // maxRequests: number,
  // duration: string = "1s",
  headers: Record<string, string> = {},
  proxy?: AxiosProxyConfig,
) {
  const axiosConfig: AxiosRequestConfig = {
    httpsAgent,
    headers,
  };
  if (proxy) axiosConfig.proxy = proxy;
  const instance = axios.create(axiosConfig);
  return instance;
  // when need to queue requests to avoid rate limit, use this:
  // return rateLimit(instance, {
  //   limits: [{ maxRequests, duration }],
  // });
}

const defaultClient = createClient({
  "User-Agent": USER_AGENT,
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
});

const viewcrateClient = createClient({
  "User-Agent": USER_AGENT,
  Accept: "text/html",
  Origin: VIEWCRATE_ORIGIN,
  Referer: VIEWCRATE_ORIGIN,
});

const filecryptClient = createClient({
  "User-Agent": USER_AGENT,
  Accept: "text/html",
  Origin: FILECRYPT_ORIGIN,
  Referer: FILECRYPT_ORIGIN,
});

const decryptitClient = createClient({
  "User-Agent": USER_AGENT,
  Accept: "application/json, text/javascript, */*",
  "Accept-Language": "en-US,en;q=0.5",
  "X-Requested-With": "XMLHttpRequest",
  Host: DECRYPTIT_HOST,
  Origin: DECRYPTIT_ORIGIN,
  Connection: "keep-alive",
  Referer: `${DECRYPTIT_ORIGIN}/`,
});

const gofileClient = createClient({
  "User-Agent": USER_AGENT,
  Accept: "application/json",
  Origin: GOFILE_ORIGIN,
  Connection: "keep-alive",
  Referer: `${GOFILE_ORIGIN}/`,
  Authorization: `Bearer ${ENV.GOFILE_TOKEN}`,
  "X-Website-Token":
    "4d3b34b24ce25cd943a73caf8c59f29d65a61ec11370f3630d53bc2dd37e42e9",
});

const kisskhClient = createClient(
  {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  },
  getWebshareProxyConfig(),
);

const onetouchtvHost = Buffer.from("YXBpMy5kZXZjb3JwLm1l=", "base64").toString(
  "utf-8",
);
const onetouchtvClient = createClient(
  {
    "User-Agent": USER_AGENT,
    Accept: "*/*",
    Origin: ONETOUCHTV_ORIGIN,
    Referer: ONETOUCHTV_ORIGIN,
  },
  getWebshareProxyConfig(),
);
onetouchtvClient.interceptors.response.use((response) => {
  response.data = decryptString(response.data);
  return response;
});

const mkvdramaClient = createClient({
  "User-Agent": USER_AGENT,
  Accept: "text/html",
  Origin: MKVDRAMA_ORIGIN,
  Referer: MKVDRAMA_ORIGIN,
});

function getClient(url: string) {
  switch (true) {
    case ENV.KISSKH_URLS.some((kisskhUrl) => url.includes(kisskhUrl)):
      return kisskhClient;
    case url.includes(onetouchtvHost):
      return onetouchtvClient;
    case url.includes(MKVDRAMA_ORIGIN):
      return mkvdramaClient;
    case url.includes(VIEWCRATE_ORIGIN):
      return viewcrateClient;
    case url.includes(FILECRYPT_ORIGIN):
      return filecryptClient;
    case url.includes(DECRYPTIT_ORIGIN):
      return decryptitClient;
    case url.includes(GOFILE_API_ORIGIN):
      return gofileClient;
    default:
      return defaultClient;
  }
}
const customClients = [
  viewcrateClient,
  filecryptClient,
  decryptitClient,
  kisskhClient,
  onetouchtvClient,
  mkvdramaClient,
];

const logger = new Logger("AXIOS");
export async function axiosGet<T>(
  url: string,
  config?: AxiosRequestConfig,
  cacheMs: number = 2 * 60 * 60 * 1000,
): Promise<T | null> {
  const urlKey = `url:${url}`;
  const cacheData = cache.get(urlKey);
  if (cacheData) return cacheData;
  let lastError: AxiosError | unknown;
  const http = getClient(url);
  let attempt = 0;
  let timeout = 0;
  let isRateLimit = false;

  // Global timeout wrapper to prevent hanging forever
  const globalTimeout = ENV.RETRY_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), globalTimeout);

  try {
    while (true) {
      attempt++;
      try {
        let cookies: FlareSolverrCookie[] = cache.get("kisskh:cookies");
        let userAgent: string = cache.get("kisskh:userAgent");
        const useFlaresolverrCookie =
          http == kisskhClient &&
          ENV.KISSKH_USE_FLARESOLVERR &&
          cookies == null;
        if (useFlaresolverrCookie) {
          const response = await getFlareSolverr(url, "kisskh", 3);
          if (!response?.solution?.response) {
            throw new FlareSolverrError("No response from flaresolverr");
          }
          if (response?.solution?.cookies) {
            cache.set(
              "kisskh:cookies",
              response?.solution?.cookies,
              TTL_MS.stream,
            );
            cookies = response?.solution?.cookies;
          }
          if (response?.solution?.userAgent) {
            cache.set(
              "kisskh:userAgent",
              response?.solution?.userAgent,
              TTL_MS.stream,
            );
            userAgent = response?.solution?.userAgent;
          }
        }
        const headers: RawAxiosRequestHeaders = { ...config?.headers };
        if (cookies)
          headers.Cookie = cookies
            .map((c) => `${c.name}=${c.value}`)
            .join("; ");
        if (userAgent) headers["User-Agent"] = userAgent;

        const axiosConfig = {
          timeout: 10000,
          ...config,
          headers,
          signal: controller.signal as any,
        };
        const response = await http.get(url, axiosConfig);
        clearTimeout(timeoutId);
        const data = response.data;
        if (customClients.includes(http)) {
          cache.set(urlKey, data, cacheMs);
        }
        return data as T;
      } catch (error: AxiosError | unknown) {
        lastError = error;
        const errorStatus =
          error instanceof AxiosError && error.response?.status;
        isRateLimit =
          errorStatus === HttpStatusCode.TooManyRequests ||
          errorStatus === HttpStatusCode.Forbidden;
        if (http === onetouchtvClient) {
          logger.log(`Error ${(error as AxiosError).response?.data}`);
          isRateLimit =
            isRateLimit ||
            errorStatus === HttpStatusCode.NotFound ||
            errorStatus === HttpStatusCode.Forbidden;
        }
        if (!isRateLimit) break;
        const delay = ENV.RETRY_DELAY_MS * attempt;
        logger.log(`Retry ${attempt} | ${url}`);
        const retryAfter = delay + Math.random() * ENV.RETRY_JITTER_MS;
        timeout += retryAfter;
        if (timeout >= ENV.RETRY_TIMEOUT_MS) {
          logger.log(`Max timeout ${ENV.RETRY_TIMEOUT_MS}ms reached | ${url}`);
          break;
        }
        await new Promise((r) => setTimeout(r, retryAfter));
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }

  if (isRateLimit) {
    throw new RateLimitError(url);
  }
  logger.error(`Fail GET | ${url} ${lastError}`);
  return null;
}

export async function axiosHead<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<boolean> {
  const urlKey = `head:url:${url}`;
  const cacheData = cache.get(urlKey);
  if (cacheData) return cacheData;
  let lastError: AxiosError | unknown;
  let attempt = 0;
  let timeout = 0;
  while (true) {
    attempt++;
    try {
      await defaultClient.head(url, { timeout: 10000, ...config });
      cache.set(urlKey, true, 24 * 60 * 60 * 1000);
      return true;
    } catch (error) {
      lastError = error;
      const status = error instanceof AxiosError ? error.response?.status : undefined;
      const isRateLimit = status === HttpStatusCode.TooManyRequests;
      if (!isRateLimit) break;
      const delay = ENV.RETRY_DELAY_MS * attempt;
      logger.log(`Retry ${attempt} HEAD | ${url}`);
      const retryAfter = delay + Math.random() * ENV.RETRY_JITTER_MS;
      timeout += retryAfter;
      if (timeout >= ENV.RETRY_TIMEOUT_MS) {
        logger.log(`Max timeout ${ENV.RETRY_TIMEOUT_MS}ms reached | ${url}`);
        break;
      }
      await new Promise((r) => setTimeout(r, retryAfter));
    }
  }
  if (!(lastError instanceof AxiosError && lastError.response?.status === HttpStatusCode.NotFound)) {
    logger.error(`Fail HEAD | ${url}, ${lastError}`);
  }
  cache.set(urlKey, false, 4 * 60 * 60 * 1000);
  return false;
}
export async function axiosPost<T>(
  url: string,
  postData?: string,
  config?: AxiosRequestConfig,
  cacheMs: number = 2 * 60 * 60 * 1000,
): Promise<T | null> {
  const urlKey = `url:${url}:${postData}`;
  const cacheData = cache.get(urlKey);
  if (cacheData) return cacheData;
  let lastError: AxiosError | unknown;
  const http = getClient(url);
  let attempt = 0;
  let timeout = 0;
  let isRateLimit = false;
  while (true) {
    attempt++;
    try {
      const response = await http.post(url, postData, config);
      const data = response.data;
      if (customClients.includes(http)) {
        cache.set(urlKey, data, cacheMs);
      }
      return data as T;
    } catch (error: AxiosError | unknown) {
      lastError = error;
      const errorStatus = error instanceof AxiosError && error.response?.status;
      isRateLimit = errorStatus === HttpStatusCode.TooManyRequests;
      if (!isRateLimit) break;
      const delay = ENV.RETRY_DELAY_MS * attempt;
      logger.log(`Retry ${attempt} | ${url}`);
      const retryAfter = delay + Math.random() * ENV.RETRY_JITTER_MS;
      timeout += retryAfter;
      if (timeout >= ENV.RETRY_TIMEOUT_MS) {
        logger.log(`Max timeout ${ENV.RETRY_TIMEOUT_MS}ms reached | ${url}`);
        break;
      }
      await new Promise((r) => setTimeout(r, retryAfter));
    }
  }
  logger.error(`Fail POST | ${url}, ${lastError}`);
  cache.set(urlKey, null, 4 * 60 * 60 * 1000);
  return null;
}
