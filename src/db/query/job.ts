import { asc, count, eq, or, sql } from "drizzle-orm";
import { handleError } from "../../utils/error.js";
import { Logger } from "../../utils/logger.js";
import { db } from "../drizzle.js";
import { EJobInsert, job, JOB_STATUS } from "../schema/job.js";

const logger = new Logger("DB");
export async function insertJobs(jobs: EJobInsert[]) {
  if (!db) return;
  try {
    await db.insert(job).values(jobs);
  } catch (e) {
    handleError(e, logger, `Failed to insert job ${jobs[0]?.id}`);
  }
}
export async function upsertJobs(jobs: EJobInsert[]) {
  if (!db) return;
  try {
    await db
      .insert(job)
      .values(jobs)
      .onConflictDoUpdate({
        target: job.id,
        set: {
          status: sql.raw(`excluded.${job.status.name}`),
          data: sql.raw(`excluded.${job.data.name}`),
        },
      });
  } catch (e) {
    handleError(e, logger, `Failed to upsert job`);
  }
}

export async function getFirstJob() {
  if (!db) return;
  const rows = await db
    .select()
    .from(job)
    .where(eq(job.status, JOB_STATUS.PENDING))
    .orderBy(asc(job.createdAt))
    .limit(1);
  return rows[0];
}

export async function countJob() {
  if (!db) return;
  const number = await db
    .select({ count: count(job.id) })
    .from(job)
    .where(eq(job.status, JOB_STATUS.PENDING));
  // .run();
  return number;
}

export async function deleteJob(id: string) {
  if (!db) return;
  const row = db.delete(job).where(eq(job.id, id));
  return row;
}

export async function getJobById(id: string) {
  if (!db) return;
  const row = db.query.job.findFirst({
    where: eq(job.id, id),
  });
  return row;
}
