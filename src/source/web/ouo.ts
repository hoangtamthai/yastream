import * as cheerio from "cheerio";
import { getOuo } from "../../db/query/ouo.js";
import {
  CMD,
  RequestPayload,
  sendFlareSolverr,
} from "../../utils/browser/flaresolverr.js";
import { OuoError } from "../../utils/error.js";
import { Logger } from "../../utils/logger.js";
export const OUO_HOSTS = ["ouo.io", "ouo.press"];

const logger = new Logger("OUO");

export async function getOuoFinalUrl(url: string, session: string = "ouo") {
  const id = getOuoId(url);
  if (!id) throw new OuoError("No id found");
  const dbOuo = await getOuo(id);
  if (dbOuo && dbOuo.redirectedUrl) {
    return dbOuo.redirectedUrl;
  }
  logger.log(`Get final url with flaresolverr | ${url}`);
  let currentUrl = url;
  let cmd: CMD = "request.get";
  let postData: string | undefined;
  let finalUrl: string | undefined;
  for (let i = 0; i < 3; i++) {
    logger.debug(`round ${i}`);
    logger.debug(`currentUrl ${currentUrl}`);
    const payload: RequestPayload = {
      url: currentUrl,
      maxTimeout: 20000,
      cmd: cmd,
      // settleTimeout: 1000,
      // captureResponses: ["*"],
      // skipHttp: true,
      // headers: {
      //   "User-Agent":
      //     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
      //   DNT: "1",
      // },
    };
    if (postData) payload.postData = postData;
    logger.debug(`payload ${JSON.stringify(payload)}`);
    // const data = await sendTrawl(payload);
    const data = await sendFlareSolverr(payload);
    logger.trace(`data ${JSON.stringify(data)}`);
    const content = data?.solution?.response;
    // logger.debug(`content ${data.url}, ${data.html}`);
    finalUrl = data?.solution?.url;
    // logger.debug(`finalUrl ${finalUrl}`);
    // parse content
    if (!content) throw new OuoError("No content");
    if (!OUO_HOSTS.some((host) => finalUrl?.includes(host))) {
      break;
    }
    const $ = cheerio.load(content);
    const parseData = {
      action: $("#form-captcha").attr("action"),
      method: $("#form-captcha").attr("method"),
      token: $('input[name="_token"]').val(),
      cfTurnstileResponse: $('input[name="cf-turnstile-response"]').val(),
      xToken: $('input[name="x-token"]').val(),
      vToken: $('input[name="v-token"]').val(),
    };
    logger.trace(`parseData ${JSON.stringify(parseData)}`);
    if (!parseData.action) {
      parseData.action = $("#form-go").attr("action");
      parseData.method = $("#form-go").attr("method");
      logger.trace(`parseData go ${JSON.stringify(parseData)}`);
    }
    if (!parseData.action) {
      parseData.action = $("#form-shorten").attr("action");
      parseData.method = $("#form-shorten").attr("method");
      logger.trace(`parseData shorten ${JSON.stringify(parseData)}`);
    }
    if (!parseData.action) throw new OuoError("No redirect url or form action");
    currentUrl = parseData.action;
    logger.debug(`parseData ${JSON.stringify(parseData)}`);
    cmd =
      parseData.method?.toUpperCase() === "POST"
        ? "request.post"
        : "request.get";
    postData = `_token=${parseData.token}${parseData.cfTurnstileResponse ? `&cf-turnstile-response=${parseData.cfTurnstileResponse}` : ""}&x-token=${parseData.xToken || ""}${parseData.vToken ? `&v-token=${parseData.vToken}` : ""}`;
  }
  logger.log(`Final Url ${finalUrl}`);
  return finalUrl;
}

export async function getDbOuo(id: string) {
  return getOuo(id);
}

// TODO: fix concurrent with browser instead of flaresolverr
export async function getOuoFinalUrlBrowser(
  url: string,
  session: string = "ouo",
) {
  logger.log(`Get final url with browser | ${url}`);
  let currentUrl = url;
  let cmd: CMD = "request.get";
  let postData: string | undefined;
  let finalUrl: string | undefined;
  for (let i = 0; i < 3; i++) {
    logger.debug(`round ${i}`);
    logger.debug(`currentUrl ${currentUrl}`);
    const payload: RequestPayload = {
      url: currentUrl,
      cmd: cmd,
      maxTimeout: 20000,
      waitInSeconds: 0,
      session,
    };
    if (postData) payload.postData = postData;
    const data = await sendFlareSolverr(payload);
    logger.trace(`data ${JSON.stringify(data)}`);
    const content = data?.solution?.response;
    finalUrl = data?.solution?.url;
    // parse content
    if (!content) throw new Error("No content");
    if (!OUO_HOSTS.some((host) => finalUrl?.includes(host))) {
      break;
    }
    const $ = cheerio.load(content);
    const parseData = {
      action: $("#form-captcha").attr("action"),
      method: $("#form-captcha").attr("method"),
      token: $('input[name="_token"]').val(),
      cfTurnstileResponse: $('input[name="cf-turnstile-response"]').val(),
      xToken: $('input[name="x-token"]').val(),
      vToken: $('input[name="v-token"]').val(),
    };
    logger.trace(`parseData ${JSON.stringify(parseData)}`);
    if (!parseData.action) {
      parseData.action = $("#form-go").attr("action");
      parseData.method = $("#form-go").attr("method");
      logger.trace(`parseData go ${JSON.stringify(parseData)}`);
    }
    if (!parseData.action) {
      parseData.action = $("#form-shorten").attr("action");
      parseData.method = $("#form-shorten").attr("method");
      logger.trace(`parseData shorten ${JSON.stringify(parseData)}`);
    }
    if (!parseData.action) throw new Error("No redirect url or form action");
    currentUrl = parseData.action;
    cmd =
      parseData.method?.toUpperCase() === "POST"
        ? "request.post"
        : "request.get";
    // application/x-www-form-urlencoded
    // const jsonPostData = JSON.stringify(parseData);
    postData = `_token=${
      parseData.token || ""
    }&cf-turnstile-response=${parseData.cfTurnstileResponse || ""}&x-token=${parseData.xToken || ""}&v-token=${parseData.vToken || ""}&g-recaptcha-response=`;
  }
  logger.log(`Final Url ${finalUrl}`);
  return finalUrl;
}

export function getOuoId(url: string) {
  const ouoId = url.split("/").pop();
  return ouoId;
}
