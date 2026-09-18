import type { Config } from "drizzle-kit";

import * as dotenv from "dotenv";
dotenv.config();

const databaseUrl = process.env.DATABASE_SUPPORTER_URL || "";
export default {
  schema: "./src/db/supporter/schema",
  out: "./drizzle/supporter",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
} satisfies Config;