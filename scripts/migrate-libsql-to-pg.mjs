#!/usr/bin/env node
/**
 * One-time data migration: libsql (Turso) -> PostgreSQL
 *
 * Usage:
 *   node scripts/migrate-libsql-to-pg.mjs \
 *     --src "libsql://localhost:55930?tls=0" \
 *     --dst "postgresql://user:pass@host:5432/yastream?sslmode=require"
 *
 * Run `pnpm db:migrate` (or push) against the target Postgres BEFORE running this.
 * Skips rows that already exist in the target (ON CONFLICT DO NOTHING).
 */
import { createClient } from "@libsql/client";
import pg from "pg";

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const srcUrl = getArg("--src") || process.env.DATABASE_URL;
const srcToken =
  getArg("--src-token") || process.env.DATABASE_WRITE_TOKEN || undefined;
const dstUrl = getArg("--dst") || process.env.DATABASE_URL;
if (!srcUrl || !dstUrl) {
  console.error("Missing --src or --dst");
  process.exit(1);
}

const TABLES = [
  "content",
  "ouo",
  "provider_content",
  "mkvdrama",
  "job",
  "kv",
  "stream",
  "subtitle",
];
// libsql foo_bar -> pg "foo_bar"; only job.created_at changes type (ms -> timestamp)
const BATCH = 500;

const src = createClient({ url: srcUrl, authToken: srcToken });
const pool = new pg.Pool({ connectionString: dstUrl, max: 4 });

function toPgValue(table, col, value) {
  if (value === null || value === undefined) return null;
  if (table === "job" && col === "created_at") {
    return new Date(Number(value)).toISOString();
  }
  return value;
}

async function migrateTable(table) {
  const cols = (await src.execute(`SELECT * FROM ${table} LIMIT 1`)).columns;
  if (!cols || cols.length === 0) {
    console.log(`${table}: empty, skipping`);
    return 0;
  }
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const conflict = {
    content: 'ON CONFLICT ("id") DO NOTHING',
    ouo: 'ON CONFLICT ("id") DO NOTHING',
    provider_content: 'ON CONFLICT ("id") DO NOTHING',
    mkvdrama: 'ON CONFLICT ("id") DO NOTHING',
    job: 'ON CONFLICT ("id") DO NOTHING',
    kv: 'ON CONFLICT ("key") DO NOTHING',
    stream: 'ON CONFLICT ("id") DO NOTHING',
    subtitle: 'ON CONFLICT ("id") DO NOTHING',
  }[table];

  let offset = 0;
  let total = 0;
  while (true) {
    const res = await src.execute({
      sql: `SELECT * FROM ${table} LIMIT ${BATCH} OFFSET ${offset}`,
      args: [],
    });
    if (res.rows.length === 0) break;

    const values = res.rows.map((row) =>
      cols.map((c) => toPgValue(table, c, row[c])),
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const v of values) {
        await client.query(
          `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ${conflict}`,
          v,
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      console.error(`${table}: batch failed at offset ${offset}: ${e.message}`);
      throw e;
    } finally {
      client.release();
    }

    total += values.length;
    offset += BATCH;
    console.log(`${table}: ${total} rows`);
  }
  return total;
}

try {
  for (const table of TABLES) {
    try {
      await migrateTable(table);
    } catch (e) {
      console.error(`${table}: FAILED | ${e.message}`);
    }
  }
} finally {
  src.close();
  await pool.end();
}
console.log("Done");