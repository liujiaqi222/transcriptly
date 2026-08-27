import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import postgres from "postgres";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`The web E2E runner did not provide ${name}.`);
  return value;
}

const databaseUrl = requiredEnvironment("DATABASE_URL");
const authSecret = requiredEnvironment("BETTER_AUTH_SECRET");
const baseURL = requiredEnvironment("WEB_E2E_BASE_URL");
const userId = randomUUID();
const secondUserId = randomUUID();
const sessionToken = `contribution-${randomUUID()}`;
const secondSessionToken = `contribution-${randomUUID()}`;
const videoId = "M7lc1UVf-VE";

const capture = {
  source: {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: "Public archive E2E transcript",
    channelName: "Transcriptly Test Channel",
    channelUrl: "https://www.youtube.com/@transcriptly-test",
    description: "A public transcript used to verify Issue 64.",
    durationSeconds: 180,
  },
  capturedAt: "2026-08-20T10:00:00.000Z",
  segments: [
    { start: 0, text: "Observable behavior makes agent systems reliable." },
    { start: 42, text: "Public archive search should find this segment." },
  ],
  chapters: [{ start: 0, title: "Reliability foundations" }],
};

let sql: ReturnType<typeof postgres>;

async function sessionCookie(token = sessionToken): Promise<string> {
  const signature = await makeSignature(token, authSecret);
  return `better-auth.session_token=${token}.${signature}`;
}

test.beforeAll(async () => {
  sql = postgres(databaseUrl, { max: 1 });
  const now = new Date();
  await sql`
    insert into "user" (id, name, email, email_verified, image, created_at, updated_at)
    values (${userId}, 'Public Contributor', ${`public-${randomUUID()}@example.test`}, true, 'https://example.test/avatar.png', ${now}, ${now})
  `;
  await sql`
    insert into "session" (id, token, user_id, expires_at, created_at, updated_at)
    values (${randomUUID()}, ${sessionToken}, ${userId}, ${new Date(now.getTime() + 3600000)}, ${now}, ${now})
  `;
  await sql`
    insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${secondUserId}, 'Second Contributor', ${`second-public-${randomUUID()}@example.test`}, true, ${now}, ${now})
  `;
  await sql`
    insert into "session" (id, token, user_id, expires_at, created_at, updated_at)
    values (${randomUUID()}, ${secondSessionToken}, ${secondUserId}, ${new Date(now.getTime() + 3600000)}, ${now}, ${now})
  `;
});

test.afterAll(async () => {
  await sql`
    delete from public_publications
    where video_id = (select id from canonical_videos where youtube_video_id = ${videoId})
  `;
  await sql`delete from "user" where id in (${userId}, ${secondUserId})`;
  await sql.end();
});

test("requires authentication for public contributions", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/v1/contributions", {
    headers: { Origin: baseURL, "Content-Type": "application/json" },
    data: { capture, targetVideoId: videoId, confirmPublicProfile: true },
  });
  expect(response.status()).toBe(401);

  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Sign in to contribute." }),
  ).toBeVisible();
});

test("requires explicit first-use confirmation and exposes consent status", async ({
  request,
}) => {
  const headers = {
    Origin: baseURL,
    Cookie: await sessionCookie(),
    "Content-Type": "application/json",
  };
  const statusBefore = await request.get("/api/v1/contributions/status", {
    headers,
  });
  expect(statusBefore.status()).toBe(200);
  await expect(statusBefore.json()).resolves.toEqual({
    success: true,
    data: {
      confirmed: false,
      displayName: "Public Contributor",
      avatarUrl: "https://example.test/avatar.png",
    },
  });

  const rejected = await request.post("/api/v1/contributions", {
    headers,
    data: { capture, targetVideoId: videoId },
  });
  expect(rejected.status()).toBe(409);
  expect((await rejected.json()).error.code).toBe(
    "public_confirmation_required",
  );

  const accepted = await request.post("/api/v1/contributions", {
    headers,
    data: { capture, targetVideoId: videoId, confirmPublicProfile: true },
  });
  expect(accepted.status()).toBe(200);
  expect((await accepted.json()).data).toEqual(
    expect.objectContaining({ videoId, outcome: "published" }),
  );

  const statusAfter = await request.get("/api/v1/contributions/status", {
    headers,
  });
  expect((await statusAfter.json()).data.confirmed).toBe(true);

  // The extension background fetches with host permissions, which bypass
  // CORS and strip the Origin header from GETs; a cookie-authenticated
  // status read without Origin must still resolve (#64).
  const statusWithoutOrigin = await request.get(
    "/api/v1/contributions/status",
    {
      headers: { Cookie: await sessionCookie() },
    },
  );
  expect(statusWithoutOrigin.status()).toBe(200);
  await expect(statusWithoutOrigin.json()).resolves.toMatchObject({
    success: true,
    data: { confirmed: true },
  });

  // The strict half of the contract: present-but-disallowed Origins are
  // rejected on reads, and writes reject a missing Origin outright.
  const statusEvilOrigin = await request.get("/api/v1/contributions/status", {
    headers: { Cookie: await sessionCookie(), Origin: "https://evil.example" },
  });
  expect(statusEvilOrigin.status()).toBe(403);

  const postWithoutOrigin = await request.post("/api/v1/contributions", {
    headers: {
      Cookie: await sessionCookie(),
      "Content-Type": "application/json",
    },
    data: { capture, targetVideoId: videoId, confirmPublicProfile: true },
  });
  expect(postWithoutOrigin.status()).toBe(403);
});

test("keeps contribution identity idempotent and first publication stable", async ({
  request,
}) => {
  const firstHeaders = {
    Origin: baseURL,
    Cookie: await sessionCookie(),
    "Content-Type": "application/json",
  };
  const duplicate = await request.post("/api/v1/contributions", {
    headers: firstHeaders,
    data: { capture, targetVideoId: videoId },
  });
  expect(duplicate.status()).toBe(200);
  expect((await duplicate.json()).data.outcome).toBe("unchanged");

  const second = await request.post("/api/v1/contributions", {
    headers: {
      ...firstHeaders,
      Cookie: await sessionCookie(secondSessionToken),
    },
    data: { capture, targetVideoId: videoId, confirmPublicProfile: true },
  });
  expect(second.status()).toBe(200);
  expect((await second.json()).data.outcome).toBe("contributed");

  const rows = await sql`
    select
      (select count(*)::int from contributions c join canonical_videos cv on cv.id = c.video_id where cv.youtube_video_id = ${videoId}) as contributions,
      (select count(*)::int from public_publications pp join canonical_videos cv on cv.id = pp.video_id where cv.youtube_video_id = ${videoId}) as publications,
      (select u.name from public_publications pp join contributions c on c.id = pp.contribution_id join "user" u on u.id = c.user_id join canonical_videos cv on cv.id = pp.video_id where cv.youtube_video_id = ${videoId}) as attributed_to
  `;
  expect(rows[0]).toEqual({
    contributions: 2,
    publications: 1,
    attributed_to: "Public Contributor",
  });
});

test("serves only active publications through detail, search, and sitemap", async ({
  page,
  request,
}) => {
  await page.goto(`/videos/${videoId}`);
  await expect(page).toHaveTitle(/Public archive E2E transcript/);
  await expect(
    page.getByRole("heading", { name: "Public archive E2E transcript" }),
  ).toBeVisible();
  await expect(
    page.getByText("Contributed by Public Contributor"),
  ).toBeVisible();
  await expect(page.getByText(/public-.*@example\.test/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "0:42" })).toHaveAttribute(
    "href",
    /t=42/,
  );
  expect(await page.locator('script[type="application/ld+json"]').count()).toBe(
    1,
  );

  await page.goto("/?q=observable");
  await expect(
    page.getByText("Observable behavior makes agent systems reliable."),
  ).toBeVisible();

  const sitemap = await request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain(`/videos/${videoId}`);

  await sql`
    update public_publications
    set active = false
    where video_id = (select id from canonical_videos where youtube_video_id = ${videoId})
  `;
  expect((await request.get(`/videos/${videoId}`)).status()).toBe(404);
  expect(await (await request.get("/?q=observable")).text()).not.toContain(
    "Observable behavior makes agent systems reliable.",
  );
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain(
    `/videos/${videoId}`,
  );
});
