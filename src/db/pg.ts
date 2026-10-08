import { Pool } from "pg";
import { ENV } from "../utils/env.js";
import { Logger } from "../utils/logger.js";

const logger = new Logger("DB");
class DatabaseManager {
  private pool: Pool | null = null;
  private replicaPool: Pool | null = null;
  private supporter: Pool | null = null;

  constructor() {
    if (ENV.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: ENV.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000,
      });
      // Surface connection errors instead of silently dropping them
      this.pool.on("error", (err) => {
        logger.error(`pool error | ${err.message}`);
      });
    }

    if (ENV.DATABASE_REPLICA_URL) {
      this.replicaPool = new Pool({
        connectionString: ENV.DATABASE_REPLICA_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000,
      });
      // Surface connection errors instead of silently dropping them
      this.replicaPool.on("error", (err) => {
        logger.error(`replica pool error | ${err.message}`);
      });
    }

    if (ENV.DATABASE_SUPPORTER_URL) {
      this.supporter = new Pool({
        connectionString: ENV.DATABASE_SUPPORTER_URL,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000,
      });
      this.supporter.on("error", (err) => {
        logger.error(`PG Supporter pool error | ${err.message}`);
      });
    }
  }

  public getDb(): Pool | null {
    return this.pool;
  }
  public getDbReplica(): Pool | null {
    return this.replicaPool;
  }

  public getSupporterDb(): Pool | null {
    return this.supporter;
  }

  public async close() {
    await this.pool?.end();
    await this.supporter?.end();
  }
}

const pg = ENV.DATABASE_ENABLED ? new DatabaseManager() : null;

export { pg };
