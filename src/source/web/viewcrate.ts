import * as cheerio from "cheerio";
import * as crypto from "crypto";
import { axiosGet, axiosPost } from "../../utils/axios.js";
import { getFlareSolverr } from "../../utils/browser/flaresolverr.js";
import { ViewcrateError } from "../../utils/error.js";
import { Logger } from "../../utils/logger.js";
import { EpisodeHoster, getHosterFromUrl, Hoster } from "../hoster/hoster.js";
import { getUrlsFromDecryptit } from "./decryptit.js";

interface ViewcrateCnl {
  crypted: string;
  jk: string;
}
export const VIEWCRATE_HOST = "viewcrate.cc";
export const VIEWCRATE_ORIGIN = `https://${VIEWCRATE_HOST}`;
const logger = new Logger("VIEWCRATE");

/** Sometimes miss links */
export async function getUrlsFromViewcrate(url: string) {
  const publicId = new URL(url).pathname.split("/").pop();
  const viewcrateCryptUrl = `${VIEWCRATE_ORIGIN}/api/cnl_encrypt/${publicId}`;
  const cnlHtml = await axiosPost<ViewcrateCnl>(viewcrateCryptUrl);
  if (!cnlHtml) throw new ViewcrateError("No cnl html");
  const urls = getUrlsFromCnl(cnlHtml);
  return urls;
}

/** Has all links */
export async function getUrlsFromViewcrateDlc(url: string, password?: string) {
  logger.log(`GET viewcrate dlc | ${url}`);
  // need to load js to have episodes
  // const html = await axiosGet<string>(url);
  const response = await getFlareSolverr(url, "viewcrate", 2);
  const html = response?.solution?.response;
  if (!html) throw new ViewcrateError("No html");
  if (html.toLowerCase().includes("protected content")) {
    throw new ViewcrateError("Protected content");
  }
  const link = await getDlcUrl(html);
  if (!link) throw new ViewcrateError("No dlc link");
  const dlcUrl = new URL(link, VIEWCRATE_ORIGIN).toString();
  const dlc = await axiosGet<string>(dlcUrl);
  if (!dlc) throw new ViewcrateError("No dlc content");
  const urls = await getUrlsFromDecryptit(dlc);
  const episodes = getEpisodeHosters(html);
  return { urls, episodes };
}

export async function getDlcUrl(html: string): Promise<string | undefined> {
  const $ = cheerio.load(html);
  const attr = $("main > div").eq(2).attr("data-resolve-url");
  if (!attr) throw new ViewcrateError("No DLC link");
  const link = `/api/dlc_url/${attr.replace("/c/", "").split("/")[0]}`;
  if (!link) throw new ViewcrateError("No DLC link");
  const dlcUrl = new URL(link, VIEWCRATE_ORIGIN).toString();
  const finalDlcUrl = await axiosGet<{ url: string }>(dlcUrl);
  return finalDlcUrl?.url;
}

function getProtectedContent(html: string) {
  const $ = cheerio.load(html);
  const csrfToken = $("input[name='csrf_token']").val();
  if (!csrfToken) throw new ViewcrateError("Protected Content No csrf");
  const action = $("form").attr("action");
  if (!action) throw new ViewcrateError("Protected Content No action");
  const postUrl = new URL(action, VIEWCRATE_ORIGIN).toString();
  return { csrfToken, postUrl };
}

export function getEpisodeHosters(html: string): EpisodeHoster[] {
  const $ = cheerio.load(html);
  const $episodes = $("main > div").eq(2).children();
  const episodes: EpisodeHoster[] = [];
  $episodes.each((_, episode) => {
    const $episode = $(episode);
    const episodeTitle = $episode.find("h2").text();
    const episodeHosters = $episode.find(`div[class^="y_"]`);
    const data: { hoster: Hoster; size: string }[] = [];
    episodeHosters.each((_, hoster) => {
      const $hoster = $(hoster);
      const sizeText = $hoster.find("span").last().text();
      let size = "";
      if (sizeText.includes("GB")) {
        size = sizeText.replace(/GB/, "").trim();
      } else if (sizeText.includes("MB")) {
        size = (parseFloat(sizeText.replace(/MB/, "").trim()) / 1024).toFixed(
          2,
        );
      }
      for (const [key, value] of Object.entries($hoster.attr() || {})) {
        if (key.startsWith("data-") && value) {
          const hoster = getHosterFromUrl(value);
          if (hoster) data.push({ size, hoster });
        }
      }
    });
    episodes.push({
      ep: parseInt(episodeTitle.replace(/.*E/, "")),
      data: data,
    });
  });
  return episodes;
}

export function parseJkAndCryptedFromHtml(html: string): {
  crypted: string;
  jk: string;
} {
  const cryptedMatch = html.match(/"crypted":"([^"]+)"/);
  const parsedJk = parseJk(html);
  return {
    crypted: cryptedMatch?.[1] ?? "",
    jk: parsedJk,
  };
}

function parseJk(jk: string) {
  const jkMatch = jk.match(/return\s+['"]([^'"]+)['"]/);
  if (!jkMatch) return "";
  return jkMatch?.[1] ?? "";
}

async function getUrlsFromCnl(viewcrateCnl: ViewcrateCnl) {
  const { crypted, jk } = viewcrateCnl;
  const parsedJk = parseJk(jk);
  const urls = await decryptCnl(parsedJk, crypted);
  return urls;
}

// async function getUrlsFromCnlHtml(html: string) {
//   const { crypted, jk } = parseJkAndCryptedFromHtml(html);
//   const urls = await decryptCnl(jk, crypted);
//   return urls;
// }

async function decryptCnl(jk: string, crypted: string) {
  const key = Buffer.from(jk, "hex");
  const combined = Buffer.from(crypted, "base64");
  const iv = combined.subarray(0, 16);
  const encrypted = combined.subarray(16);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  const text = decrypted.toString("utf8");
  const urls = text.match(/https?:\/\/[^\s"'<>]+/g) || [];
  return urls;
}

export function decodeViewcrateToken(raw: string) {
  const encoded = raw.trim();
  if (!encoded) return null;
  try {
    const normalized = encoded
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const decoded = Buffer.from(normalized, "base64").toString("utf8").trim();
    return /^[a-f0-9]{16,}$/i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}
