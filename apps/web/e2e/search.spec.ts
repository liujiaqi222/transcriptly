import { randomUUID } from "node:crypto";
import {
  type Browser,
  type BrowserContext,
  expect,
  test,
} from "@playwright/test";
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

const ownerUserId = randomUUID();
const peerUserId = randomUUID();
const ownerToken = `search-owner-${randomUUID()}`;
const peerToken = `search-peer-${randomUUID()}`;

// YouTube-shaped 11-character ids.
const latinVideoId = "srch0000001";
const cjkVideoId = "srch0000002";
const peerVideoId = "srch0000003";

const baseCapturedAt = new Date("2026-08-21T12:00:00.000Z");

let sql: ReturnType<typeof postgres>;

async function seedUser(userId: string, name: string, sessionToken: string) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  await sql`
    insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${userId}, ${name}, ${`${userId}@example.test`}, true, ${now}, ${now})
  `;
  await sql`
    insert into "session" (id, token, user_id, expires_at, created_at, updated_at)
    values (${randomUUID()}, ${sessionToken}, ${userId}, ${expiresAt}, ${now}, ${now})
  `;
}

async function seedCapture(options: {
  userId: string;
  videoId: string;
  title: string;
  segments: { start: number; text: string }[];
  capturedAt: Date;
}): Promise<string> {
  const [video] = await sql`
    insert into canonical_videos (
      youtube_video_id, source_url, title, channel_name, channel_url,
      description, published_at, duration_seconds, source_captured_at
    ) values (
      ${options.videoId},
      ${`https://www.youtube.com/watch?v=${options.videoId}`},
      ${options.title},
      ${"Search Channel"},
      ${"https://www.youtube.com/@search"},
      ${""},
      ${new Date("2026-01-15T00:00:00.000Z")},
      ${70},
      ${options.capturedAt}
    )
    returning id
  `;
  if (!video) throw new Error("Seed canonical video was not created.");

  const [transcript] = await sql`
    insert into transcripts (video_id, content_hash)
    values (${video.id}, ${randomUUID()})
    returning id
  `;
  if (!transcript) throw new Error("Seed transcript was not created.");

  for (const [position, segment] of options.segments.entries()) {
    await sql`
      insert into segments (transcript_id, position, start_seconds, text)
      values (${transcript.id}, ${position}, ${segment.start}, ${segment.text})
    `;
  }

  await sql`
    insert into library_items (user_id, video_id, transcript_id, captured_at)
    values (${options.userId}, ${video.id}, ${transcript.id}, ${options.capturedAt})
  `;
  return video.id;
}

async function authenticatedContext(
  browser: Browser,
  sessionToken: string,
): Promise<BrowserContext> {
  const signature = await makeSignature(sessionToken, authSecret);
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: `${sessionToken}.${signature}`,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return context;
}

async function sessionCookie(sessionToken: string): Promise<string> {
  const signature = await makeSignature(sessionToken, authSecret);
  return `better-auth.session_token=${sessionToken}.${signature}`;
}

test.beforeAll(async () => {
  sql = postgres(databaseUrl, { max: 1 });
  await seedUser(ownerUserId, "Search Owner", ownerToken);
  await seedUser(peerUserId, "Search Peer", peerToken);

  await seedCapture({
    userId: ownerUserId,
    videoId: latinVideoId,
    title: "Machine learning basics",
    segments: [
      { start: 0, text: "Welcome to this machine learning course" },
      { start: 5, text: "Today we study gradient descent" },
      { start: 10, text: "Ada Lovelace was the first programmer" },
      { start: 15, text: "Thanks for watching" },
      { start: 20, text: "This partial match should not count" },
    ],
    capturedAt: baseCapturedAt,
  });

  await seedCapture({
    userId: ownerUserId,
    videoId: cjkVideoId,
    title: "中文播客",
    segments: [
      { start: 0, text: "大家好，欢迎收听本期节目" },
      { start: 5, text: "今天我们讨论机器学习的工作原理" },
      { start: 10, text: "感谢大家的支持" },
    ],
    capturedAt: new Date(baseCapturedAt.getTime() - 60 * 1000),
  });

  await seedCapture({
    userId: peerUserId,
    videoId: peerVideoId,
    title: "Peer private video",
    segments: [
      { start: 0, text: "The peer also mentions Ada Lovelace here" },
      { start: 5, text: "Peer discusses 机器学习 privately" },
    ],
    capturedAt: new Date(baseCapturedAt.getTime() - 2 * 60 * 1000),
  });
});

test.afterAll(async () => {
  await sql`delete from "user" where id in (${ownerUserId}, ${peerUserId})`;
  await sql`
    delete from canonical_videos
    where youtube_video_id = any(${[latinVideoId, cjkVideoId, peerVideoId]})
  `;
  await sql.end();
});

test("unauthenticated visitors enter the sign-in flow", async ({ page }) => {
  await page.goto("/saved/search?q=Lovelace");
  await expect(page).toHaveURL(
    /\/sign-in\?callbackURL=%2Fsaved%2Fsearch%3Fq%3DLovelace$/,
  );
});

test("exact name search returns the video, hit context and timestamp link", async ({
  request,
}) => {
  const response = await request.get(
    `/saved/search?q=${encodeURIComponent("Lovelace")}`,
    {
      headers: { Cookie: await sessionCookie(ownerToken) },
    },
  );
  expect(response.status()).toBe(200);

  const html = await response.text();
  // The matching video identity.
  expect(html).toContain("Machine learning basics");
  expect(html).toContain("Search Channel");
  // The hit segment plus surrounding context, in order.
  expect(html).toContain("Ada Lovelace was the first programmer");
  expect(html).toContain("Today we study gradient descent");
  expect(html).toContain("Thanks for watching");
  expect(html.indexOf("Today we study gradient descent")).toBeLessThan(
    html.indexOf("Ada Lovelace was the first programmer"),
  );
  expect(html.indexOf("Ada Lovelace was the first programmer")).toBeLessThan(
    html.indexOf("Thanks for watching"),
  );
  // The hit links to the moment in the video.
  expect(html).toContain("&amp;t=10s");
  // Private search surfaces are never indexed.
  expect(html).toContain("noindex, nofollow");
});

test("Latin search respects word boundaries", async ({ request }) => {
  const response = await request.get(
    `/saved/search?q=${encodeURIComponent("art")}`,
    { headers: { Cookie: await sessionCookie(ownerToken) } },
  );
  expect(response.status()).toBe(200);

  const html = await response.text();
  expect(html).not.toContain("Machine learning basics");
  expect(html).not.toContain("This partial match should not count");
});

test("CJK exact search matches substrings inside a longer segment", async ({
  request,
}) => {
  const response = await request.get(
    `/saved/search?q=${encodeURIComponent("机器学习")}`,
    { headers: { Cookie: await sessionCookie(ownerToken) } },
  );
  expect(response.status()).toBe(200);

  const html = await response.text();
  expect(html).toContain("中文播客");
  expect(html).toContain("今天我们讨论机器学习的工作原理");
  expect(html).toContain("大家好，欢迎收听本期节目");
  expect(html).toContain("感谢大家的支持");
  expect(html).toContain("&amp;t=5s");
});

test("other users' private segments never enter results", async ({
  request,
}) => {
  // The peer's text matches both queries exactly, but is scoped to the peer.
  const latin = await request.get(
    `/saved/search?q=${encodeURIComponent("Lovelace")}`,
    { headers: { Cookie: await sessionCookie(ownerToken) } },
  );
  expect((await latin.text()).includes("Peer private video")).toBe(false);

  const cjk = await request.get(
    `/saved/search?q=${encodeURIComponent("机器学习")}`,
    { headers: { Cookie: await sessionCookie(ownerToken) } },
  );
  expect((await cjk.text()).includes("Peer private video")).toBe(false);
  expect((await cjk.text()).includes("Peer discusses")).toBe(false);
});

test("empty query shows an explicit enter-a-term state", async ({
  browser,
}) => {
  const context = await authenticatedContext(browser, ownerToken);
  const page = await context.newPage();

  try {
    await page.goto("/saved/search");
    await expect(
      page.getByRole("heading", { name: "Search your transcripts" }),
    ).toBeVisible();
    await expect(page.getByText("Enter a search term")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("no matches shows an explicit empty-result state", async ({ browser }) => {
  const context = await authenticatedContext(browser, ownerToken);
  const page = await context.newPage();

  try {
    await page.goto(`/saved/search?q=${encodeURIComponent("zzzznothing")}`);
    await expect(
      page.getByRole("heading", { name: "No matches" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("the search box pre-fills the current term", async ({ browser }) => {
  const context = await authenticatedContext(browser, ownerToken);
  const page = await context.newPage();

  try {
    await page.goto(`/saved/search?q=${encodeURIComponent("Lovelace")}`);
    await expect(page.locator('input[name="q"]')).toHaveValue("Lovelace");
  } finally {
    await context.close();
  }
});
