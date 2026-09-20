import { eq } from "drizzle-orm";
import { supporterDb } from "../../drizzle.js";
import { supporter } from "../schema/supporter.js";

export async function getSupporter(email: string) {
  if (!supporterDb) return;
  const [row] = await supporterDb
    .select()
    .from(supporter)
    .where(eq(supporter.email, email))
    .limit(1);
  return row;
}
