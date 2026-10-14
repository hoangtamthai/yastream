import { AxiosProxyConfig } from "axios";
import { ENV } from "../env.js";

export function getWebshareProxyConfig() {
  if (!ENV.PROXY_WEBSHARE_URL) return undefined;
  const proxyConfig: AxiosProxyConfig = {
    host: ENV.PROXY_WEBSHARE_URL,
    port: ENV.PROXY_WEBSHARE_PORT,
    auth: {
      username: ENV.PROXY_WEBSHARE_USERNAME,
      password: ENV.PROXY_WEBSHARE_PASSWORD,
    },
    protocol: "http",
  };
  return proxyConfig;
}

export function getWebshareProxyUrl() {
  if (!ENV.PROXY_WEBSHARE_URL) return undefined;
  return `http://${ENV.PROXY_WEBSHARE_USERNAME}:${ENV.PROXY_WEBSHARE_PASSWORD}@${ENV.PROXY_WEBSHARE_URL}:${ENV.PROXY_WEBSHARE_PORT}`;
}
