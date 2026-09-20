import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export enum JOB_TYPE {
  MKVDRAMA_STREAM = "MKVDRAMA_STREAM",
  MKVDRAMA_SCRAPE = "MKVDRAMA_SCRAPE",
}
export enum JOB_STATUS {
  PENDING = "pending",
  FAILED = "failed",
  DONE = "done",
}

export const job = pgTable("job", {
  id: text("id").primaryKey(),
  status: text("status", {
    enum: [JOB_STATUS.PENDING, JOB_STATUS.FAILED, JOB_STATUS.DONE],
  }).notNull(),
  type: text("type", {
    enum: [JOB_TYPE.MKVDRAMA_STREAM, JOB_TYPE.MKVDRAMA_SCRAPE],
  }).notNull(),
  data: text("data").notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type EJob = typeof job.$inferSelect;
export type EJobInsert = typeof job.$inferInsert;
