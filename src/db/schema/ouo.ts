import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
export const ouo = pgTable("ouo", {
  id: text("id").primaryKey(),
  originalUrl: text("original_url").notNull(),
  redirectedUrl: text("redirected_url"),
  password: text("password"),
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

export type EOuo = typeof ouo.$inferSelect;
export type EOuoInsert = typeof ouo.$inferInsert;
