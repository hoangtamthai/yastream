import axios, { AxiosInstance } from "axios";
import { load } from "cheerio";
import { CookieData, CookiePriority, CookieSameSite } from "puppeteer";
import { cache, TTL_MS } from "../cache.js";
import { ENV } from "../env.js";
import { FlareSolverrError } from "../error.js";
import { Logger } from "../logger.js";

// Types
export type CMD =
  | "request.get"
  | "request.post"
  | "sessions.create"
  | "sessions.destroy";
export interface FlareSolverrResponse<T = any> {
  status: "ok" | "error";
  message?: string;
  solution?: {
    url: string;
    status: number;
    response: string;
    cookies: FlareSolverrCookie[];
    userAgent: string;
  };
  session?: string;
  sessions?: string[];
}

export interface FlareSolverrCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: CookieSameSite;
  expiry?: number;
  priority?: CookiePriority;
}

export interface RequestPayload {
  cmd: CMD;
  url?: string;
  session?: string;
  maxTimeout?: number;
  waitInSeconds?: number;
  disableMedia?: boolean;
  postData?: string;
}

const logger = new Logger("FLARESOLVERR");
let client: AxiosInstance | null = null;
const MAX_TIMEOUT = ENV.FLARESOLVERR_MAX_TIMEOUT;
const WAIT_IN_SECONDS = ENV.FLARESOLVERR_WAIT_IN_SECONDS;

export async function getFlareSolverr(
  url: string,
  session: string,
  waitInSeconds = WAIT_IN_SECONDS,
): Promise<FlareSolverrResponse | null> {
  try {
    const cacheKey = `flaresolverr:${url}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const payload: RequestPayload = {
      cmd: "request.get",
      url,
      session,
      maxTimeout: MAX_TIMEOUT,
      waitInSeconds,
      disableMedia: false,
    };
    const result = await sendFlareSolverr(payload);
    if (!result.solution?.response) return null;
    // result.solution.response = [result.solution.response].join("\n");
    cache.set(cacheKey, result, TTL_MS.stream);
    return result;
  } catch (error) {
    logger.error(`FlareSolverr request failed: ${error}`);
    return null;
  }
}

export async function postFlareSolverr(
  url: string,
  session: string,
  waitInSeconds = WAIT_IN_SECONDS,
  postData = "",
): Promise<FlareSolverrResponse | null> {
  try {
    const cacheKey = `flaresolverr:${url}:${postData}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const payload: RequestPayload = {
      cmd: "request.post",
      url,
      session,
      maxTimeout: MAX_TIMEOUT,
      waitInSeconds,
      disableMedia: false,
      postData,
    };
    const result = await sendFlareSolverr(payload);
    if (!result.solution?.response) return null;

    cache.set(cacheKey, result, TTL_MS.stream);
    return result;
  } catch (error) {
    logger.error(`FlareSolverr request failed: ${error}`);
    return null;
  }
}

export async function sendFlareSolverr(
  payload: RequestPayload,
): Promise<FlareSolverrResponse> {
  const c = getClient();
  if (!c) throw new FlareSolverrError("FlareSolverr not available");

  const res = await c.post<FlareSolverrResponse>("", payload);
  if (res.data.status !== "ok") {
    throw new FlareSolverrError(`Request failed: ${res.data.message}`);
  }
  return res.data;
}

function getClient(): AxiosInstance | null {
  if (!ENV.FLARESOLVERR_URL) return null;
  if (!client) {
    client = axios.create({
      baseURL: ENV.FLARESOLVERR_URL,
      headers: {
        "Content-Type": "application/json",
        Authorization: `${ENV.FLARESOLVERR_AUTH_HEADER}`,
      },
      timeout: MAX_TIMEOUT,
    });
  }
  return client;
}

export async function createSession(name: string): Promise<string> {
  const c = getClient();
  if (!c) throw new FlareSolverrError("FlareSolverr not available");

  const payload = { cmd: "sessions.create", session: name };
  const res = await c.post<FlareSolverrResponse>("", payload);
  if (res.data.status !== "ok" || !res.data.session) {
    throw new Error(`Create session failed: ${res.data.message}`);
  }
  logger.log(`Session ${name}: ${res.data.message ?? "created"}`);
  return res.data.session;
}

export async function destroySession(session: string): Promise<void> {
  const c = getClient();
  if (!c || !session) return;

  const payload: RequestPayload = { cmd: "sessions.destroy", session };
  const res = await c.post<FlareSolverrResponse>("", payload);
  if (res.data.status !== "ok") {
    logger.warn(`Destroy session warning: ${res.data.message}`);
  }
  logger.log(`Session ${session} destroyed`);
}

export function convertToCookieData(cookie: FlareSolverrCookie): CookieData {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
  };
}

export function parseDataFromFlaresolverr(html: string) {
  const $ = load(html);
  const text = $("pre").text().trim();
  if (!text) {
    return html;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
