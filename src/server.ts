import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import analytics from "./api/router/analytics.js";
import api from "./api/router/api.js";
import dashboard from "./api/router/dashboard.js";
import publicRouter from "./api/router/public.js";
import stremio from "./api/router/stremio.js";
import { initMigrations } from "./db/drizzle.js";
import { buildManifest } from "./lib/manifest.js";
import { startCronJob } from "./service/job/job.js";
import { API } from "./utils/constant.js";
import { ENV } from "./utils/env.js";
import { Logger } from "./utils/logger.js";

const logger = new Logger("SERVER");
const HOST = "0.0.0.0";
const PORT = ENV.PORT;
async function warmCache() {
  const defaultCatalogUrls = buildManifest()
    .catalogs.filter((catalog) => {
      return !catalog.id.toLowerCase().includes("search");
    })
    .map((catalog) => `/catalog/${catalog.type}/${catalog.id}.json`);
  const warmUrls = ["/manifest.json", ...defaultCatalogUrls];
  await Promise.all(
    warmUrls.map((url) => {
      fetch("http://localhost:" + PORT + url);
    }),
  );
}

const app = new Hono();
app.use("*", cors());
app.route("/", analytics);
app.route("/", stremio);
app.route(`/${API}`, api);
app.route("/", publicRouter);
app.route("/dashboard", dashboard);

// Error handling
app.onError((err, c) => {
  logger.error(`${err}`);
  return c.text("Internal Server Error", 500);
});

// Start server
await initMigrations();
startCronJob();
try {
  serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
    logger.log(`yastream running on http://${HOST}:${PORT}`);
  });
  if (ENV.WARM_CACHE) {
    await warmCache();
    logger.log(`Warming cache completed`);
  }
} catch (error) {
  logger.log(`Fail to start | ${error}`);
}

// Global catch to prevent crashes
process.on("unhandledRejection", (reason, _) => {
  logger.error(`UNHANDLED_REJECTION | Reason: ${reason}`);
});
process.on("uncaughtException", (err) => {
  logger.error(`UNCAUGHT_EXCEPTION | ${err}`);
});
process.on("SIGTERM", () => {
  logger.log("SIGTERM");
  // cache.persistDb();
  process.exit();
});
process.on("SIGINT", () => {
  logger.log("SIGINT");
  // cache.persistDb();
  process.exit();
});
