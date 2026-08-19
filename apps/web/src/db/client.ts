import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getServerEnv } from "../env/server";
import { authRelations, canonicalVideos } from "./schema";

function createDatabase() {
  const queryClient = postgres(getServerEnv().DATABASE_URL, {
    connect_timeout: 5,
    idle_timeout: 20,
    max: 5,
    onnotice: () => undefined,
  });
  return drizzle({
    client: queryClient,
    relations: { ...authRelations },
  });
}

let database: ReturnType<typeof createDatabase> | undefined;

export function getDatabase() {
  database ??= createDatabase();
  return database;
}

export const databaseHealthCheck = {
  async verifyConnection(): Promise<void> {
    await getDatabase()
      .select({ id: canonicalVideos.id })
      .from(canonicalVideos)
      .limit(1);
  },
};
