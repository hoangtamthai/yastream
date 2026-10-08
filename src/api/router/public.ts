import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import { Hono } from "hono";
import path from "path";
import pkg from "../../../package.json" with { type: "json" };
import { defaultConfig } from "../../lib/manifest.js";
import { ENV } from "../../utils/env.js";

const publicRouter = new Hono();
const rootDir = process.cwd();
const publicDir = path.join(rootDir, "public");
// Serve custom landing page at root
let cachedLandingHtml: string | null = null;
const getLandingPage = () => {
  if (cachedLandingHtml) return cachedLandingHtml;
  const filePath = path.join(publicDir, "landing.html");
  const changelogPath = path.join(rootDir, "CHANGELOG.md");
  if (!fs.existsSync(filePath)) return null;
  const changelog = fs.existsSync(changelogPath)
    ? fs.readFileSync(changelogPath, "utf-8")
    : "";
  cachedLandingHtml = fs
    .readFileSync(filePath, "utf8")
    .replace("{{VERSION}}", pkg.version)
    .replaceAll("{{UMAMI_URL}}", ENV.UMAMI_URL)
    .replaceAll("{{UMAMI_WEBSITE_ID}}", ENV.UMAMI_WEBSITE_ID)
    .replaceAll("{{UMAMI_SHARE_ID}}", ENV.UMAMI_SHARE_ID)
    .replace("{{CHANGELOG}}", mdToHtml(changelog))
    .replace("{{DEFAULT_CONFIG}}", JSON.stringify(defaultConfig));

  return cachedLandingHtml;
};

function mdToHtml(md: string) {
  return md
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^### (.*$)/gim, "<h4>$1</h4>")
    .replace(/^## (.*$)/gim, "<h3>$1</h3>")
    .replace(/^# (.*$)/gim, "<h2>$1</h2>")
    .replace(/(\d+\.\s+.*)$/gm, "<ol>$1</ol>")
    .replace(/^\* (.*$)/gim, "<li>$1</li>")
    .replace(/^\- (.*$)/gim, "<li>$1</li>")
    .replace(/\*\*(.*)\*\*/gim, "<b>$1</b>");
}

// Public static file
const CACHE_SECONDS = 3600;
const CACHE_CONTROL = `max-age=${CACHE_SECONDS}, public`;
publicRouter.use(async (c, next) => {
  c.header("cache-control", CACHE_CONTROL);
  return next();
});
publicRouter.on("GET", ["/", "/configure", "/:configBase64/configure"], (c) => {
  const html = getLandingPage();
  return html ? c.html(html) : c.notFound();
});
publicRouter.use(
  "/*",
  serveStatic({
    root: "./public",
  }),
);

export default publicRouter;
