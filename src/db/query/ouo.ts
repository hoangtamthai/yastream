import { eq, sql } from "drizzle-orm";
import { handleError } from "../../utils/error.js";
import { Logger } from "../../utils/logger.js";
import { db } from "../drizzle.js";
import { EOuoInsert, ouo } from "../schema/ouo.js";

const logger = new Logger("DB");
export async function upsertOuos(ouos: EOuoInsert[]) {
  if (!db) return;
  try {
    await db
      .insert(ouo)
      .values(ouos)
      .onConflictDoUpdate({
        target: ouo.id,
        set: {
          originalUrl: sql.raw(`excluded.${ouo.originalUrl.name}`),
          redirectedUrl: sql.raw(`excluded.${ouo.redirectedUrl.name}`),
        },
      });
  } catch (e) {
    handleError(e, logger, `Failed to upsert ouo`);
  }
}

export async function getOuo(id: string) {
  if (!db) return;
  const [row] = await db.select().from(ouo).where(eq(ouo.id, id)).limit(1);
  return row;
}
