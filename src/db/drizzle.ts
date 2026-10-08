import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { withReplicas } from "drizzle-orm/pg-core";
import { Logger } from "../utils/logger.js";
import { pg } from "./pg.js";
import { relations } from "./schema/relations.js";
import { relations as supporterRelations } from "./supporter/schema/relations.js";

const logger = new Logger("DB");

const pool = pg?.getDb();
const replicaPool = pg?.getDbReplica();
const db = pool
  ? replicaPool
    ? withReplicas(
        drizzle({ client: pool, relations }),
        [
          drizzle({ client: replicaPool, relations }),
        ],
      )
    : drizzle({ client: pool, relations })
  : null;

const supporterDbClient = pg?.getSupporterDb();
const supporterDb = supporterDbClient
  ? drizzle({ client: supporterDbClient, relations: supporterRelations })
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
    // if (supporterDb) {
    //   await migrate(supporterDb, { migrationsFolder: "drizzle/supporter" });
    //   logger.log("Migration supporter completed");
    // } else {
    //   logger.log("Migration skipped: Database not initialized");
    // }
  } catch (err) {
    logger.error(`Migration failed: ${err}`);
    throw err;
  }
}
