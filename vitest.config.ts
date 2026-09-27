import { defineConfig } from "vitest/config";

import * as dotenv from "dotenv";
dotenv.config();
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "hoster",
          include: ["./src/source/hoster/*.test.ts"],
        },
      },
      {
        test: {
          name: "util",
          include: ["./src/utils/*.test.ts"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["./src/utils/browser/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "source",
          include: ["./src/source/*.test.ts"],
        },
      },
      {
        test: {
          name: "service",
          include: ["./src/service/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "web",
          include: ["./src/source/web/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "debrid",
          include: ["./src/source/debrid/**/*.test.ts"],
        },
      },
    ],
    environment: "node",
    // include: ["src/**/*.test.ts"],
    globals: true,
    env: process.env,
  },
});
