/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { load } from "cheerio";
import puppeteer, { CookieData, Handler, Page } from "puppeteer";
import { OUO_HOSTS } from "../../source/web/ouo.js";
import { PIXELDRAIN_HOST, USER_AGENT } from "../constant.js";
import { ENV } from "../env.js";
import { handleError } from "../error.js";
import { Logger } from "../logger.js";

const logger = new Logger("PUPPETEER");
const FINAL_HOSTS = [...OUO_HOSTS, PIXELDRAIN_HOST];

export async function getBrowser() {
  return await puppeteer.connect({
    browserWSEndpoint: ENV.PUPPETEER_WS_ENDPOINT, // ws://localhost:3000
    headers: {
      Authorization: `${ENV.PUPPETEER_AUTH_HEADER}`,
    },
  });
}

function parseFormFields(html: string, formSelector: string): string {
  const $ = load(html);
  const form = $(formSelector);
  if (!form.length) return "";

  const params = new URLSearchParams();
  form.find("input").each((_, el) => {
    const name = $(el).attr("name");
    const value = $(el).val();
    if (name && typeof value === "string") {
      params.append(name, value);
    }
  });
  return params.toString();
}

const PAGE_WAIT_MS = 5000;
export async function getPuppeteerRequest(
  url: string,
  cookies?: any,
  userAgent?: string,
) {
  const browser = await getBrowser();
  browser.setCookie(...(cookies || []));
  const page = await browser.newPage();
  let html = "";
  page.setUserAgent({ userAgent: userAgent || USER_AGENT });
  try {
    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 5000,
    });
    html = await page.content();
    // await page.evaluate(() => {
    //   const script = document.querySelector("script");
    //   if (!script) return;
    //   script();
    // });
    // await page.waitForSelector('div[class^="z_81fjv"]');
  } catch (error) {
    console.error(error);
  } finally {
    await page.close();
    await browser.close();
  }
  return html;
}
// export async function getPuppeteerRequest(
//   url: string,
//   cookies?: any,
//   userAgent?: string,
// ) {
//   const browser = await getBrowser();
//   browser.setCookie(...(cookies || []));
//   const page = await browser.newPage();
//   if (userAgent) {
//     page.setUserAgent({ userAgent });
//   }
//   let xhrStatus = null;
//   const downloadDataPromise = page
//     .waitForResponse(
//       (resp) => {
//         if (
//           resp.url().includes("_l_krc_uo") ||
//           resp.url().includes("oe_pq_invxe_l")
//         ) {
//           xhrStatus = resp.status();
//           return resp.status() === 200;
//         }
//         return false;
//       },
//       { timeout: PAGE_WAIT_MS },
//     )
//     .catch(() => null);
//   await page.goto(url, {
//     waitUntil: "load",
//     timeout: 5000,
//   });
//   const downloadResponse = await downloadDataPromise;
//   if (downloadResponse) {
//     logger.log(`Download data XHR completed in ms`);
//     await new Promise((r) => setTimeout(r, 1500));
//   } else {
//     logger.log(
//       `Download XHR not detected (xhr status: ${xhrStatus}), waiting for selectors...`,
//     );
//     try {
//       await page.waitForSelector(".soraddlx, .soraddl, .soradd", {
//         timeout: PAGE_WAIT_MS,
//       });
//       await new Promise((r) => setTimeout(r, 500));
//     } catch {
//       logger.log(
//         `No download sections appeared within ${PAGE_WAIT_MS}ms`,
//       );
//     }
//   }

//   const content = await page.content();
//   // const cookies = await browser.cookies();
//   await browser.close();
//   return { content, cookies };
// }
const NOT_FINAL_HOSTS = [
  "sl.buisthainan.com",
  "mkvdrama",
  "send",
  "cloudflare",
  "google",
  "gstatic",
  "jsdelivr",
  "turnstile",
];

export async function postRedirectedUrlCDP(
  targetUrl: string,
  postData?: string,
  cookies?: CookieData[],
  userAgent?: string,
  formSelector?: string,
) {
  let redirectedUrl = "";
  const browser = await getBrowser();
  if (cookies) browser.setCookie(...cookies);
  try {
    const page: Page = await browser.newPage();
    page.setUserAgent({ userAgent: userAgent || USER_AGENT });
    await page.setRequestInterception(true);
    const client = await page.createCDPSession();
    await client.send("Network.enable");

    let formActionUrl = targetUrl;
    if (formSelector && !postData) {
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
      const html = await page.content();
      const $ = load(html);
      formActionUrl = $(formSelector).attr("action") || targetUrl;
      postData = parseFormFields(html, formSelector);
      logger.trace(`form action ${formActionUrl}`);
      logger.trace(`parsed postData ${postData?.substring(0, 80)}`);
    }

    // for (const link of cLinks) {
    let redirectLocation: string | undefined;
    const changeToPost: Handler<any> = (interceptRequest) => {
      var data = {
        method: "POST",
        postData: postData,
      };
      interceptRequest.continue(data);
    };
    const onRequestSent: Handler<any> = (params) => {
      // Capture redirect response Location header
      logger.trace(`onRequestSent params ${params.documentURL}`);
      // Also capture any request to an external domain (follow-up after redirect)
      // Request modified... finish sending!
      const reqUrl = params.request?.url || "";

      logger.trace(`reqUrl ${reqUrl}`);
      if (
        reqUrl.startsWith("http") &&
        !NOT_FINAL_HOSTS.some((host) => reqUrl.includes(host))
      ) {
        if (!redirectLocation) {
          redirectLocation = reqUrl.split("?__cf_chl")[0];
          if (redirectLocation) redirectedUrl = redirectLocation;
        }
      }
      return;
    };

    page.on("request", changeToPost);
    client.on("Network.requestWillBeSent", onRequestSent);
    logger.trace(`on request: ${formActionUrl}`);
    try {
      // Trigger a navigation to the _c/ URL via fetch (it will fail due to CORS,
      // but CDP captures the redirect before the CORS error)
      await page.goto(formActionUrl, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
      // // Brief wait for CDP events to arrive
      await new Promise((r) => setTimeout(r, 500));
    } catch (error) {
      handleError(error, logger, `Fail post CDP request ${targetUrl}`);
    }
    // client.off("Network.requestWillBeSent", onRequestSent);
    logger.trace(`off request: ${targetUrl}`);
    if (redirectLocation) {
      logger.log(`redirected (CDP): ${targetUrl} → ${redirectLocation}`);
      return redirectLocation;
    }
    await page.close();
  } catch (cdpErr) {
    logger.error(`CDP resolution failed: ${cdpErr}`);
  } finally {
    await browser.disconnect();
  }
  return redirectedUrl;
}

/**
 * Turn on capture network events and get redirected url
 * @param targetUrl
 * @param cookies
 * @param userAgent
 * @returns redirectedUrl
 */
export async function getRedirectedUrlCDP(
  targetUrl: string,
  cookies?: CookieData[],
  userAgent?: string,
) {
  let redirectedUrl: string | null = "";
  const browser = await getBrowser();
  if (cookies) browser.setCookie(...cookies);
  try {
    const page: Page = await browser.newPage();
    page.setUserAgent({ userAgent: userAgent || USER_AGENT });
    const client = await page.createCDPSession();
    await client.send("Network.enable");
    let redirectLocation: string | undefined;
    const onRequestSent: Handler<any> = (params) => {
      // Capture redirect response Location header
      logger.trace(`onRequestSent params ${params.documentURL}`);
      // Also capture any request to an external domain (follow-up after redirect)
      const reqUrl = params.request?.url || "";
      logger.log(`reqUrl ${reqUrl}`);
      if (
        reqUrl.startsWith("http") &&
        !NOT_FINAL_HOSTS.some((host) => reqUrl.includes(host))
      ) {
        logger.trace(`redirectLocation ${redirectLocation}`);
        if (!redirectLocation) {
          redirectLocation = reqUrl.split("?__cf_chl")[0];
          if (redirectLocation) redirectedUrl = redirectLocation;
        }
      }
      if (FINAL_HOSTS.some((host) => params.documentURL.includes(host))) {
        redirectLocation = params.documentURL;
        return;
      }
      return;
    };

    client.on("Network.requestWillBeSent", onRequestSent);
    logger.trace(`on request: ${targetUrl}`);
    try {
      // Trigger a navigation to the _c/ URL via fetch (it will fail due to CORS,
      // but CDP captures the redirect before the CORS error)
      await page.goto(targetUrl, {
        waitUntil: "load",
        timeout: ENV.PUPPETEER_TIMEOUT_MS,
      });
      // Brief wait for CDP events to arrive
      await new Promise((r) => setTimeout(r, 500));
    } catch (error) {
      handleError(error, logger, `Fail CDP request ${targetUrl}`);
    }
    client.off("Network.requestWillBeSent", onRequestSent);
    logger.trace(`off request: ${targetUrl}`);
    if (redirectLocation) {
      logger.log(`redirected (CDP): ${targetUrl} → ${redirectLocation}`);
      return redirectLocation;
    }

    await client.detach().catch(() => {});
  } catch (cdpErr) {
    logger.error(`CDP resolution failed: ${cdpErr}`);
  } finally {
    await browser.disconnect();
  }
  return redirectedUrl ? redirectedUrl : null;
}

// export async function scrapeWithRemoteBrowser(
//   targetUrl: string,
//   cookies?: CookieData[],
// ) {
//   const browser = await getBrowser();
//   try {
//     if (cookies && cookies.length > 0) browser.setCookie(...cookies);
//     const page: Page = await browser.newPage();
//     logger.log(`broswer cookies ${JSON.stringify(await browser.cookies())}`);
//     page;
//     await page.goto(targetUrl, {
//       waitUntil: "domcontentloaded",
//       timeout: 20000,
//     });
//     logger.log(`page title ${await page.url()}`);
//     // Get your link
//     const rawResult = await page.evaluate(() => {});
//   } finally {
//     // This only closes the TAB, not the whole browser process!
//     await browser.disconnect();
//   }
// }
