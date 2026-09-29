import { UserConfig } from "../../lib/manifest.js";
import { axiosGet } from "../../utils/axios.js";
import { GOFILE_API_ORIGIN, GOFILE_ORIGIN } from "../../utils/constant.js";
import { cleanUrl } from "../../utils/format.js";

interface GofileContent {}
export function filterGofileUrls(urls: string[]) {
  return urls
    .filter((url) => url.includes(GOFILE_ORIGIN))
    .map((url) => cleanUrl(url));
}

export async function getGofileContent(gofileId: string) {
  const contentUrl = `${GOFILE_API_ORIGIN}/contents/${gofileId}?page=1&pageSize=10&sortField=name&sortDirection=1`;
  const data = await axiosGet<GofileContent>(contentUrl);
  return data;
}

export async function getGofileDownloadUrl(url: string, config: UserConfig) {
  return "";
}
