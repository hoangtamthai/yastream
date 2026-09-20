import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";
dotenv.config();

const databaseUrl = process.env.DATABASE_URL || "";
export default defineConfig({
  schema: "./src/db/schema",
  out: "./drizzle/yastream",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
