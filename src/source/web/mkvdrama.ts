import * as cheerio from "cheerio";
import { axiosGet } from "../../utils/axios.js";
import { getFlareSolverr } from "../../utils/browser/flaresolverr.js";
import { MKVDRAMA_ORIGIN } from "../../utils/constant.js";
import { MkvdramaError } from "../../utils/error.js";
import { EpisodeHoster, getHosterFromUrl, Hoster } from "../hoster/hoster.js";
import { getUrlsFromDecryptit } from "./decryptit.js";

export async function getUrlsFromMkvdrama(url: string) {
  const response = await getFlareSolverr(url, "mkvdrama", 0);
  const html = response?.solution?.response;
  if (!html) throw new MkvdramaError("No html");
  const episodes = getEpisodeHostersFromMkvdrama(html);
  const link = await getDlcUrl(html);
  if (!link) throw new MkvdramaError("No dlc link");
  const dlcUrl = new URL(link, MKVDRAMA_ORIGIN).toString();
  const dlc = await axiosGet<string>(dlcUrl);
  if (!dlc) throw new MkvdramaError("No dlc content");
  const urls = await getUrlsFromDecryptit(dlc);
  return { urls, episodes: episodes };
}

function getDlcUrl(html: string): string | undefined {
  const $ = cheerio.load(html);
  const link = $("a.btn-dlc").attr("href");
  if (!link) throw new MkvdramaError("No DLC link");
  return new URL(link, MKVDRAMA_ORIGIN).toString();
}

function getEpisodeHostersFromMkvdrama(html: string) {
  const $ = cheerio.load(html);
  const episodes: EpisodeHoster[] = [];
  const $episodes = $("ul.link-list").children();
  $episodes.each((_, el) => {
    const $el = $(el);
    const seasonEpisodeStr = $el.attr("data-e") || "";
    const host = $el.attr("data-h") || "";
    const hoster = getHosterFromUrl(host);
    const sizeText = $el.find(".badge-size").text().trim() || "";
    let size = "";
    if (sizeText.includes("GB")) {
      size = sizeText.replace(/GB/, "").trim();
    } else if (sizeText.includes("MB")) {
      size = (parseFloat(sizeText.replace(/MB/, "").trim()) / 1024).toFixed(2);
    }
    if (!seasonEpisodeStr) return;
    const ep = parseInt(seasonEpisodeStr.replace(/.*E/, ""));
    if (isNaN(ep)) return;
    const data: { hoster: Hoster; size: string }[] = [];
    if (hoster) data.push({ size, hoster });
    episodes.push({ ep, data });
  });
  return episodes;
}
