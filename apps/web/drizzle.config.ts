import { defineConfig } from "drizzle-kit";
import { loadLocalDatabaseEnvironment } from "./env-loader";
import { getServerEnv } from "./src/env/server";

loadLocalDatabaseEnvironment();

export default defineConfig({
  out: "./drizzle",
  schema: "./src/modules/cloud/database/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: getServerEnv().DATABASE_URL,
  },
});
