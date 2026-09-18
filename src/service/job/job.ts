import { CronJob } from "cron";
import {
  countJob,
  deleteJob,
  getFirstJob,
  getJobById,
  insertJobs,
  upsertJobs,
} from "../../db/query/job.js";
import { EJob, EJobInsert, JOB_STATUS, JOB_TYPE } from "../../db/schema/job.js";
import { ContentDetail } from "../../source/meta.js";
import { mkvdrama } from "../../source/mkvdrama.js";
import { ENV } from "../../utils/env.js";
import { handleError } from "../../utils/error.js";
import { Logger } from "../../utils/logger.js";
import { ntfy } from "../../utils/notify/ntfy.js";

export interface JobMkvdramaStream {
  mkvdramaId: string;
  content: ContentDetail;
}
export interface JobMkvdramaScrape {
  pageUrl: string;
}

const logger = new Logger("JOB");

export function addJob(job: EJobInsert) {
  logger.log(`Add ${job.id}`);
  insertJobs([job]);
}

export function upsertJob(job: EJobInsert) {
  upsertJobs([job]);
}

export function startCronJob() {
  if (!ENV.JOB_ENABLED) return;
  const CRON = ENV.JOB_CRON;
  logger.log(`Starting cron job ${CRON}`);
  const cronJob = new CronJob(
    CRON,
    () => runCronJob(),
    null, // onComplete
    false,
    "Europe/Berlin",
  );
  cronJob.start();
}

const jobMap = new Map<string, EJob>();

async function runCronJob() {
  const job = await getFirstJob();
  if (!job) return;
  if (jobMap.has(job.id)) return;
  jobMap.set(job.id, job);

  const start = Date.now();
  switch (job.type) {
    case JOB_TYPE.MKVDRAMA_STREAM:
      try {
        logger.log(`Running ${job.id}`);
        await mkvdrama.runMkvdramaStream(job);
      } catch (error: any) {
        handleError(error, logger, `Failed to run ${job.id}`);
        const data = JSON.parse(job.data);
        data.error = error.message;
        job.data = JSON.stringify(data);
        upsertJob({ ...job, status: JOB_STATUS.FAILED });
        ntfy("yastream job failed", `${job.id}`, "low");
        jobMap.delete(job.id);
        break;
      }
      job.status = JOB_STATUS.DONE;
      upsertJob(job);
      jobMap.delete(job.id);
      break;
    case JOB_TYPE.MKVDRAMA_SCRAPE:
      try {
        logger.log(`Running ${job.id}`);
        await mkvdrama.runMkvdramaScrape(job);
      } catch (error: any) {
        handleError(error, logger, `Failed to run ${job.id}`);
        const data = JSON.parse(job.data);
        data.error = error.message;
        job.data = JSON.stringify(data);
        upsertJob({ ...job, status: JOB_STATUS.FAILED });
        ntfy("yastream job failed", `${job.id}`, "low");
        jobMap.delete(job.id);
        break;
      }
      job.status = JOB_STATUS.DONE;
      upsertJob(job);
      jobMap.delete(job.id);
      break;
    default:
      break;
  }
  const end = Date.now();
  logger.log(`${job.id} took ${end - start}ms`);
}

export async function getJobQueue() {
  const count = await countJob();
  if (!count) return { total: 0, wait: 0 };
  const total = Number(count[0]?.count ?? 0);
  return { total, wait: Math.ceil(total * 0.5) };
}

export async function getJob(id: string) {
  const job = await getJobById(id);
  if (!job) return null;
  return job;
}
