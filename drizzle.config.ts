import type { Config } from "drizzle-kit";

import * as dotenv from "dotenv";
dotenv.config();

const databaseUrl = process.env.DATABASE_URL || "";
export default {
  schema: "./src/db/schema",
  out: "./drizzle/yastream",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
} satisfies Config;