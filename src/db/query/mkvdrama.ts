import { handleError } from "../../utils/error.js";
import { Logger } from "../../utils/logger.js";
import { db } from "../drizzle.js";
import { EMkvdramaInsert, mkvdrama } from "../schema/mkvdrama.js";

const logger = new Logger("DB");
export async function upsertMkvdrama(mkvdramas: EMkvdramaInsert[]) {
  if (!db) return;
  try {
    await db.insert(mkvdrama).values(mkvdramas);
    logger.debug(`Upserted mkvdrama ${mkvdramas[0]?.providerContentId}`);
  } catch (e) {
    handleError(e, logger, `Failed to upsert mkvdrama`);
  }
}

export function getMkvdrama(providerContentId: string) {
  if (!db) return;
  const row = db.query.mkvdrama.findMany({
    where: {
      providerContentId: providerContentId,
    },
    with: {
      ouo: true,
    },
  });
  return row;
}
