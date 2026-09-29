import * as cheerio from "cheerio";
import { axiosGet } from "../../utils/axios.js";
import { getFlareSolverr } from "../../utils/browser/flaresolverr.js";
import { FILECRYPT_ORIGIN } from "../../utils/constant.js";
import { FilecryptError, handleError } from "../../utils/error.js";
import { Logger } from "../../utils/logger.js";
import { EpisodeHoster, getHosterFromUrl, Hoster } from "../hoster/hoster.js";
import { getUrlsFromDecryptit } from "./decryptit.js";

const session = "filecrypt";
const logger = new Logger("FILECRYPT");
export async function getUrlsFromFilecrypt(url: string) {
  const response = await getFlareSolverr(url, session, 0);
  const html = response?.solution?.response;
  if (!html) throw new FilecryptError("No html");
  const episodes = getEpisodeHosters(html);
  if (episodes.length === 0) throw new FilecryptError("No available episodes");
  const $ = cheerio.load(html);
  const dlcButton = $("button.dlcdownload");
  const dlcButtonAttrs = dlcButton.attr() || {};
  let dlcId = "";
  for (const [key, value] of Object.entries(dlcButtonAttrs)) {
    if (key.startsWith("data-") && value) {
      dlcId = value;
      break;
    }
  }
  if (!dlcId) throw new FilecryptError("No dlcId found");
  const dlc = await getDlcFromFilecryptId(dlcId);
  const urls = await getUrlsFromDecryptit(dlc);
  return { urls, episodes };
}

export function getEpisodeHosters(html: string): EpisodeHoster[] {
  const episodes: EpisodeHoster[] = [];
  const $ = cheerio.load(html);
  const $table = $("table tbody tr");
  const files: { hoster: Hoster; size: string; ep: number }[] = [];
  $table.each((_, file) => {
    const $file = $(file);
    const isOffline = $file.find("i").hasClass("offline");
    if (isOffline) return;
    const title = $file.find("td").eq(1).text();
    let epString = "";
    try {
      const epRegex = /.*E(\d+)/;
      const match = title.match(epRegex);
      if (!match) throw new FilecryptError("No ep found");
      const [regex, ep] = match;
      if (!ep) throw new FilecryptError("No ep found");
      epString = ep;
    } catch (error) {
      handleError(error, logger, `Fail parse ep ${title}`);
      return;
    }
    const ep = parseInt(epString);
    const hostUrl = $file.find("a.external_link").attr("href");
    if (!hostUrl) throw new FilecryptError("No host url");
    const hoster = getHosterFromUrl(hostUrl);
    if (!hoster) return;
    const sizeText = $file.find("td").eq(2).text().trim();
    let size = "";
    if (sizeText.includes("GB")) {
      size = sizeText.replace(/GB/, "").trim();
    } else if (sizeText.includes("MB")) {
      size = (parseFloat(sizeText.replace(/MB/, "").trim()) / 1024).toFixed(2);
    }
    files.push({ hoster, size, ep });
  });
  const episodeMap = Object.groupBy(files, (file) => file.ep.toString());
  Object.values(episodeMap).forEach((episodeFiles) => {
    if (episodeFiles == undefined || episodeFiles.length == 0) return;
    const firstFile = episodeFiles[0];
    if (!firstFile) return;
    const ep = firstFile.ep;
    const data = episodeFiles.map((hosterData) => {
      const hoster = hosterData.hoster;
      const size = hosterData.size;
      return { hoster, size };
    });
    episodes.push({ ep, data });
  });

  return episodes;
}

export async function getDlcFromFilecryptId(dlcId: string) {
  const filecryptDlcUrl = `${FILECRYPT_ORIGIN}/DLC/${dlcId}.dlc`;
  const dlcContent = await axiosGet<string>(filecryptDlcUrl);
  if (!dlcContent) throw new FilecryptError("No dlcContent");
  return dlcContent;
}
