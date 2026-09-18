import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const supporter = pgTable("supporter", {
  email: text("email").primaryKey(),
  provider: text("provider", { enum: ["kofi", "stripe", "manual"] }).notNull(),
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id").unique(),

  tierName: text("tier_name").notNull(),
  status: text("status", {
    enum: ["active", "trialing", "past_due", "canceled", "expired"],
  })
    .notNull()
    .default("active"),

  currentPeriodStart: timestamp("current_period_start", { mode: "date" })
    .notNull()
    .defaultNow(),
  currentPeriodEnd: timestamp("current_period_end", { mode: "date" })
    .notNull()
    .defaultNow(),

  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),

  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});