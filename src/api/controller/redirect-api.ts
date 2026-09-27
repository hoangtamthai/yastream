import { Context } from "hono";
import { defaultConfig } from "../../lib/manifest.js";
import RedirectService from "../../service/redirect/redirect-service.js";
import { isHosterUrl } from "../../source/hoster/hoster.js";
import { OUO_HOSTS } from "../../source/web/ouo.js";
import { extractHeaderInfo } from "../router/analytics.js";
import { decodeConfig } from "../router/stremio.js";

export const REDIRECT = "redirect";
export async function redirectApiHandler(c: Context) {
  const args = c.req.param("args");
  if (!args) {
    return c.text("Missing parameters", 400);
  }
  const isHoster = isHosterUrl(args);
  if (isHoster) {
    const configBase64 = c.req.param("configBase64");
    const config = configBase64 ? decodeConfig(configBase64) : defaultConfig;
    config.ip = extractHeaderInfo(c).ip;
    const url = args;
    return RedirectService.resolveHosterRedirectUrl(url, c, config);
  }

  const [protocol, path, season, episode] = args.split(":");
  if (!protocol || !path || !season || !episode) {
    return c.text("Invalid URL", 400);
  }
  if (!OUO_HOSTS.some((host) => args.includes(host))) {
    return c.text("Invalid URL", 400);
  }

  try {
    const url = `${protocol}:${path}`;
    return RedirectService.resolveRedirectUrl(url, c, episode);
  } catch {
    return c.text("Invalid request", 400);
  }
}
