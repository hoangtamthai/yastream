import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Logger } from "../utils/logger.js";
import { content, contentRelations } from "./schema/content.js";
import { job } from "./schema/job.js";
import { kv } from "./schema/kv.js";
import { mkvdrama, mkvdramaRelations } from "./schema/mkvdrama.js";
import { ouo, ouoRelations } from "./schema/ouo.js";
import {
  providerContent,
  providerContentRelations,
} from "./schema/provider_content.js";
import { stream } from "./schema/stream.js";
import { subtitle } from "./schema/subtitle.js";
import { pg } from "./pg.js";
import { supporter } from "./supporter/schema/supporter.js";

const logger = new Logger("DB");

const schema = {
  content,
  providerContent,
  streams: stream,
  subtitles: subtitle,
  kv,
  mkvdrama,
  ouo,
  job,
  mkvdramaRelations,
  ouoRelations,
  contentRelations,
  providerContentRelations,
};

const pool = pg?.getDb();
const db = pool
  ? drizzle(pool, {
      schema,
    })
  : null;

const supporterDbClient = pg?.getSupporterDb();
const supporterDb = supporterDbClient
  ? drizzle(supporterDbClient, {
      schema: {
        supporter,
      },
    })
  : null;

export { db, supporterDb };

export async function initMigrations() {
  try {
    if (db) {
      await migrate(db, { migrationsFolder: "drizzle/yastream" });
      logger.log("Migration yastream completed");
    } else {
      logger.log("Migration skipped: Database not initialized");
    }
    if (supporterDb) {
      await migrate(supporterDb, { migrationsFolder: "drizzle/supporter" });
      logger.log("Migration supporter completed");
    } else {
      logger.log("Migration skipped: Database not initialized");
    }
  } catch (err) {
    logger.log(`Migration skipped: ${err}`);
  }
}