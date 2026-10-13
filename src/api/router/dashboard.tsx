import { Hono } from "hono";
import { tailwind } from "hono-tailwind";
import ProviderService from "../../service/provider/provider-service.js";
import StreamService from "../../service/resource/stream-service.js";
import SubtitleService from "../../service/resource/subtitle-service.js";
import { getKisskhMetrics, selectKisskhUrl } from "../../source/kisskh.js";
import { cache } from "../../utils/cache.js";
import { ENV } from "../../utils/env.js";

const dashboard = new Hono();

function StatCard({ title, value }: { title: string; value: any }) {
  return (
    <div class="bg-secondary-background p-4 rounded-box flex-1 text-center min-w-35 border border-border-foreground hover:border-accent transition-colors duration-300">
      <div class="text-xs text-secondary-foreground uppercase tracking-wider">
        {title}
      </div>
      <div class="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}

function MetricBadge({
  label,
  value,
  type,
}: {
  label: string;
  value: any;
  type: "success" | "fail" | "neutral";
}) {
  const colors =
    type === "success"
      ? "bg-green-500/20 text-green-400"
      : type === "fail"
        ? "bg-red-500/20 text-red-400"
        : "bg-foreground/20 text-foreground";
  return (
    <div
      class={`inline-flex items-center gap-2 px-3 py-1 rounded-box ${colors}`}
    >
      <span class="text-xs uppercase">{label}</span>
      <span class="font-bold">{value}</span>
    </div>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const percent = Math.min((value / max) * 100, 100);
  const color =
    percent > 80
      ? "bg-red-500"
      : percent > 60
        ? "bg-yellow-500"
        : "bg-green-500";
  return (
    <div class="w-full bg-secondary-background rounded-full h-2 overflow-hidden">
      <div
        class={`h-full ${color} transition-all duration-500`}
        style={{ width: `${percent}%` }}
      ></div>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div class="mb-4">
      <h2 class="text-lg font-semibold text-foreground">{title}</h2>
      {subtitle && (
        <p class="text-xs text-secondary-foreground mt-1">{subtitle}</p>
      )}
    </div>
  );
}

const tailwindPathIn = "./public/css/tailwind.css";
const tailwindPathOut = "./public/css/tailwind-style.css";
const tailwindPath = "/dashboard/tailwind.css";
dashboard.use(
  "/tailwind.css",
  tailwind({
    in: tailwindPathIn,
    out: process.env.NODE_ENV === "production" ? tailwindPathOut : "",
    cacheControl:
      process.env.NODE_ENV === "production"
        ? "public, max-age=86400"
        : "no-cache",
  }),
);
dashboard.get("/", async (c) => {
  const DEBUG_KEY = ENV.DEBUG_KEY;
  const userKey = c.req.query("key");

  if (userKey !== DEBUG_KEY) {
    return c.text("Unauthorized", 403);
  }

  if (c.req.query("clear") !== undefined) {
    cache.clearAll();
    return c.text("Cache cleared successfully", 200);
  }

  const data = cache.getCacheStats();

  const totalContent = await ProviderService.getTotalProviderContent();
  const totalStreams = await StreamService.getTotalStreams();
  const totalSubtitles = await SubtitleService.getTotalSubtitles();

  const metrics = getKisskhMetrics();
  const metricsEntries = Array.from(metrics.entries());
  const totalSuccess = Array.from(metrics.values()).reduce(
    (sum, m) => sum + m.success,
    0,
  );
  const totalFail = Array.from(metrics.values()).reduce(
    (sum, m) => sum + m.fail,
    0,
  );

  return c.html(
    <html>
      <head>
        <link rel="preload" href={tailwindPath} as="style" />
        <link rel="stylesheet" href={tailwindPath}></link>
        <link rel="icon" href="/img/yas.png"></link>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>yastream dashboard</title>
        <style>{`
          :root {
            --rounded-[10px]: 10px;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .fade-in {
            animation: fadeIn 0.3s ease-out forwards;
          }
          tr:hover td {
            background-color: rgba(0, 122, 255, 0.1);
          }
        `}</style>
      </head>
      <body class="bg-background text-foreground font-sans p-4 flex justify-center">
        <div class="w-full max-w-5xl fade-in">
          <div class="flex justify-center mb-10">
            <div class="relative">
              <div class="absolute w-10 h-10 bg-foreground -top-3 -left-3"></div>
              <h1 class="relative z-10 bg-background px-6 py-2 text-5xl font-bold">
                yastream dashboard
              </h1>
              <div class="absolute w-10 h-10 bg-foreground -bottom-3 -right-3"></div>
            </div>
          </div>

          <section class="mb-10">
            <SectionHeader
              title="Database Stats"
              subtitle="Content and stream statistics"
            />
            <div class="flex flex-wrap gap-4">
              <StatCard
                title="Total Content"
                value={totalContent.toLocaleString()}
              />
              <StatCard
                title="Total Streams"
                value={totalStreams.toLocaleString()}
              />
              <StatCard
                title="Total Subtitles"
                value={totalSubtitles.toLocaleString()}
              />
            </div>
          </section>

          <section class="mb-10">
            <SectionHeader
              title="Kisskh URL Metrics"
              subtitle="Request success and failure rates"
            />
            <div class="flex flex-wrap gap-3 mb-4">
              <MetricBadge
                label="Current URL"
                value={selectKisskhUrl()}
                type="neutral"
              />
              <MetricBadge
                label="Success"
                value={totalSuccess.toLocaleString()}
                type="success"
              />
              <MetricBadge
                label="Fail"
                value={totalFail.toLocaleString()}
                type="fail"
              />
              {totalSuccess + totalFail > 0 && (
                <MetricBadge
                  label="Rate"
                  value={`${((totalSuccess / (totalSuccess + totalFail)) * 100).toFixed(1)}%`}
                  type="neutral"
                />
              )}
            </div>

            <div class="overflow-x-auto bg-secondary-background rounded-box border border-border-foreground">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-border-foreground bg-background">
                    <th class="text-left p-3">URL</th>
                    <th class="text-left p-3">Success</th>
                    <th class="text-left p-3">Fail</th>
                    <th class="text-left p-3">Last Used</th>
                    <th class="text-left p-3">Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {metricsEntries.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        class="p-6 text-center text-secondary-foreground"
                      >
                        No metrics recorded yet
                      </td>
                    </tr>
                  ) : (
                    metricsEntries.map(([url, m]) => (
                      <tr
                        key={url}
                        class="border-b border-border-foreground last:border-b-0"
                      >
                        <td class="p-3 font-mono text-xs text-accent">{url}</td>
                        <td class="p-3 text-green-400">
                          {m.success.toLocaleString()}
                        </td>
                        <td class="p-3 text-red-400">
                          {m.fail.toLocaleString()}
                        </td>
                        <td class="p-3 text-secondary-foreground">
                          {m.lastUsed
                            ? new Date(m.lastUsed).toLocaleString()
                            : "N/A"}
                        </td>
                        <td class="p-3">
                          <span
                            class={`px-2 py-1 rounded ${m.fail > m.success ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}
                          >
                            {((m.success + 1) / (m.fail + 1)).toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section class="mb-10">
            <SectionHeader
              title="Cache"
              subtitle="Memory and item cache statistics"
            />
            <div class="flex flex-wrap gap-4 mb-4">
              <StatCard title="Items" value={data.itemCount.toLocaleString()} />
              <StatCard
                title="Memory"
                value={`${data.memoryUsed} / ${data.maxLimit} MB`}
              />
              <StatCard title="Usage" value={`${data.usagePercent}%`} />
            </div>
            <div class="mt-4">
              <a
                href={`/dashboard?key=${userKey}&clear=true`}
                class="inline-block bg-red-600 px-5 py-2 rounded-box hover:bg-red-700 transition-colors font-medium"
                onclick="return confirm('Really clear all cache?')"
              >
                Clear All Cache
              </a>
            </div>
          </section>
        </div>
      </body>
    </html>,
  );
});

export default dashboard;
