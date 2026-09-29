import { MEGA_ORIGIN } from "../../utils/constant.js";
import { cleanUrl } from "../../utils/format.js";

export function filterMegaUrls(urls: string[]) {
  return urls
    .filter((url) => url.includes(MEGA_ORIGIN))
    .map((url) => cleanUrl(url));
}
