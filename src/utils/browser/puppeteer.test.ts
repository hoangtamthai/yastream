import { describe, expect, it } from "vitest";
import { MkvdramaScraper } from "../../source/mkvdrama.js";
import { Provider } from "../../source/provider.js";
import { getFlareSolverr } from "./flaresolverr.js";
import { getRedirectedUrlCDP } from "./puppeteer.js";

describe("Puppeteer", () => {
  it.skip("get redirected url", async () => {
    const mkvdrama = new MkvdramaScraper(Provider.MKVDRAMA);
    const searchMkvdramaId = "780112-girl-rules";
    const data = await mkvdrama.getDetailAndEpisodes(searchMkvdramaId);
    if (!data) return [];
    if (!(data.links.length > 0)) return [];
    const bestLink = data.links.reverse().find((link) => {
      return ["2160p", "1080p", "1080pHD"].includes(link.quality);
    });
    if (!bestLink) return [];
    const redirectUrl = `${mkvdrama.baseUrl}${bestLink.link}`;
    const start = Date.now();
    // 1 use flaresolverr, avg 2s
    const response = await getFlareSolverr(redirectUrl, "mkvdrama", 0);
    const end = Date.now();
    console.log(`time ${end - start}`);
    console.log(`link ${JSON.stringify(response?.solution?.url)}`);
    const start2 = Date.now();
    // 2 use puppeteer, avg 4s
    const ouoLink = await getRedirectedUrlCDP(
      redirectUrl,
      data.response?.solution?.cookies,
      data.response?.solution?.userAgent,
    );
    const end2 = Date.now();
    console.log(`time2 ${end2 - start2}`);
    console.log(`ouoLink ${ouoLink}`);
    expect(ouoLink).contain("ouo");
    return ouoLink;
  }, 30000);

  it("get concurrent redirected url", async () => {
    const mkvdrama = new MkvdramaScraper(Provider.MKVDRAMA);
    const searchMkvdramaId = "780112-girl-rules";
    const data = await mkvdrama.getDetailAndEpisodes(searchMkvdramaId);
    if (!data) return [];
    if (!(data.links.length > 0)) return [];
    const ouos = await Promise.all(
      data.links.map(async (link) => {
        const redirectUrl = `${mkvdrama.baseUrl}${link.link}`;
        const start = Date.now();
        // 1 use flaresolverr, avg 2s
        const response = await getFlareSolverr(redirectUrl, "mkvdrama", 0);
        const end = Date.now();
        console.log(`time ${end - start}`);
        console.log(`link ${JSON.stringify(response?.solution?.url)}`);
        const start2 = Date.now();
        // 2 use puppeteer, avg 4s
        const ouoLink = await getRedirectedUrlCDP(
          redirectUrl,
          data.response?.solution?.cookies,
          data.response?.solution?.userAgent,
        );
        const end2 = Date.now();
        console.log(`time2 ${end2 - start2}`);
        console.log(`ouoLink ${ouoLink}`);
        expect(ouoLink).contain("ouo");
        return ouoLink;
      }),
    );
    console.log("ouos", ouos);
    // expect(ouoLink).contain("ouo");
    return ouos;
  }, 30000);
});
