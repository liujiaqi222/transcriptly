import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { cpSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";

const containerName = `transcriptly-web-e2e-${randomUUID()}`;
let app: ChildProcess | undefined;
let cleanedUp = false;

function run(command: string, args: string[], env = process.env): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    env,
    stdio: ["inherit", "pipe", "inherit"],
  }).trim();
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function availablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local port."));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;

  if (app?.pid) {
    try {
      process.kill(-app.pid, "SIGTERM");
    } catch {
      // The app has already exited.
    }
  }

  try {
    execFileSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
  } catch {
    // The container was never created or has already exited.
  }
}

process.once("exit", cleanup);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    cleanup();
    process.exit(1);
  });
}

try {
  run("docker", [
    "run",
    "--rm",
    "-d",
    "--name",
    containerName,
    "-e",
    "POSTGRES_DB=transcriptly",
    "-e",
    "POSTGRES_USER=transcriptly",
    "-e",
    "POSTGRES_PASSWORD=transcriptly",
    "-p",
    "127.0.0.1::5432",
    "postgres:17-alpine",
  ]);

  const postgresPort = run("docker", [
    "inspect",
    containerName,
    "--format",
    '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
  ]);

  let postgresReady = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      execFileSync(
        "docker",
        [
          "exec",
          containerName,
          "pg_isready",
          "-U",
          "transcriptly",
          "-d",
          "transcriptly",
        ],
        { stdio: "ignore" },
      );
      postgresReady = true;
      break;
    } catch {
      await sleep(500);
    }
  }
  if (!postgresReady) throw new Error("PostgreSQL did not become ready.");

  const appPort = await availablePort();
  const baseURL = `http://127.0.0.1:${appPort}`;
  const env = {
    ...process.env,
    DATABASE_URL: `postgresql://transcriptly:transcriptly@127.0.0.1:${postgresPort}/transcriptly`,
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
    BETTER_AUTH_URL: baseURL,
    GOOGLE_CLIENT_ID: "web-e2e-google-client",
    GOOGLE_CLIENT_SECRET: "web-e2e-google-secret",
    GITHUB_CLIENT_ID: "web-e2e-github-client",
    GITHUB_CLIENT_SECRET: "web-e2e-github-secret",
    WEB_E2E_BASE_URL: baseURL,
  };

  run("pnpm", ["db:migrate"], env);
  run("pnpm", ["build"], env);

  const standaloneStatic = ".next/standalone/apps/web/.next/static";
  mkdirSync(standaloneStatic, { recursive: true });
  cpSync(".next/static", standaloneStatic, { recursive: true });

  app = spawn(process.execPath, [".next/standalone/apps/web/server.js"], {
    detached: true,
    env: {
      ...env,
      HOSTNAME: "127.0.0.1",
      PORT: String(appPort),
    },
    stdio: "inherit",
  });

  let appReady = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (app.exitCode !== null) {
      throw new Error(`Next.js exited before E2E started (${app.exitCode}).`);
    }
    try {
      const response = await fetch(`${baseURL}/api/health/ready`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        appReady = true;
        break;
      }
    } catch {
      // App is still starting.
    }
    await sleep(500);
  }
  if (!appReady) throw new Error("Next.js did not become ready.");

  execFileSync(
    "pnpm",
    ["exec", "playwright", "test", "--config", "playwright.config.ts"],
    { env, stdio: "inherit" },
  );
} finally {
  cleanup();
}
