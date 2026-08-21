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
const ownerToken = `saved-owner-${randomUUID()}`;
const peerToken = `saved-peer-${randomUUID()}`;

// YouTube-shaped 11-character ids.
const sharedVideoId = "shr00000001";
const peerOnlyVideoId = "peer0000001";
const ownVideoIds = Array.from(
  { length: 22 },
  (_, index) => `own${String(index + 1).padStart(8, "0")}`,
);

const baseCapturedAt = new Date("2026-08-21T12:00:00.000Z");
const sharedSegments = [
  { start: 0, text: "Welcome to the show" },
  { start: 5, text: "Today we dig in" },
  { start: 65, text: "Thanks for watching" },
];
const sharedChapters = [
  { start: 0, title: "Opening" },
  { start: 60, title: "Deep dive" },
];

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
  description?: string;
  segments: { start: number; text: string }[];
  chapters?: { start: number; title: string }[];
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
      ${"Seed Channel"},
      ${"https://www.youtube.com/@seed"},
      ${options.description ?? ""},
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
  for (const [position, chapter] of (options.chapters ?? []).entries()) {
    await sql`
      insert into chapters (transcript_id, position, start_seconds, title)
      values (${transcript.id}, ${position}, ${chapter.start}, ${chapter.title})
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
  await seedUser(ownerUserId, "Saved Owner", ownerToken);
  await seedUser(peerUserId, "Saved Peer", peerToken);

  // The newest item for the owner; the peer saves the same video, sharing
  // one immutable Transcript across both Library Items.
  const sharedVideoRow = await seedCapture({
    userId: ownerUserId,
    videoId: sharedVideoId,
    title: "Shared transcript video",
    description: "An in-depth discussion about testing.",
    segments: sharedSegments,
    chapters: sharedChapters,
    capturedAt: baseCapturedAt,
  });
  const [sharedTranscript] = await sql`
    select transcript_id from library_items
    where user_id = ${ownerUserId} and video_id = ${sharedVideoRow}
  `;
  await sql`
    insert into library_items (user_id, video_id, transcript_id, captured_at)
    values (
      ${peerUserId},
      ${sharedVideoRow},
      ${sharedTranscript.transcript_id},
      ${new Date(baseCapturedAt.getTime() - 30 * 60 * 1000)}
    )
  `;

  await seedCapture({
    userId: peerUserId,
    videoId: peerOnlyVideoId,
    title: "Peer only video",
    segments: [{ start: 0, text: "Peer private segment" }],
    capturedAt: new Date(baseCapturedAt.getTime() - 31 * 60 * 1000),
  });

  for (const [index, videoId] of ownVideoIds.entries()) {
    await seedCapture({
      userId: ownerUserId,
      videoId,
      title: `Owner video ${index + 1}`,
      segments: [
        { start: 0, text: `Owner segment one ${videoId}` },
        { start: 10, text: `Owner segment two ${videoId}` },
      ],
      capturedAt: new Date(baseCapturedAt.getTime() - (index + 1) * 60 * 1000),
    });
  }
});

test.afterAll(async () => {
  await sql`delete from "user" where id in (${ownerUserId}, ${peerUserId})`;
  await sql`
    delete from canonical_videos
    where youtube_video_id = any(${[sharedVideoId, peerOnlyVideoId, ...ownVideoIds]})
  `;
  await sql.end();
});

test("unauthenticated visitors enter the sign-in flow", async ({ page }) => {
  await page.goto("/saved");
  await expect(page).toHaveURL(/\/sign-in\?callbackURL=%2Fsaved$/);

  await page.goto(`/saved/${sharedVideoId}`);
  await expect(page).toHaveURL(
    new RegExp(
      `/sign-in\\?callbackURL=${encodeURIComponent(`/saved/${sharedVideoId}`)}$`,
    ),
  );
});

test("lists only the owner's items with thumbnails and pagination", async ({
  browser,
}) => {
  const context = await authenticatedContext(browser, ownerToken);
  const page = await context.newPage();

  try {
    await page.goto("/saved");

    await expect(page.locator("main ul > li")).toHaveCount(20);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );

    // Only the owner's items: the peer-only video never appears.
    await expect(page.getByText("Peer only video")).toHaveCount(0);

    // Newest capture first, with identity, channel, transcript size and thumbnail.
    const firstCard = page.locator("main ul > li").first();
    await expect(
      firstCard.getByRole("link", { name: /Shared transcript video/ }),
    ).toHaveAttribute("href", `/saved/${sharedVideoId}`);
    await expect(firstCard.getByText("Seed Channel")).toBeVisible();
    await expect(firstCard.getByText("3 segments")).toBeVisible();
    await expect(
      firstCard.locator(`img[src*="i.ytimg.com/vi/${sharedVideoId}"]`),
    ).toBeVisible();

    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    await page.getByRole("link", { name: /Next/ }).click();
    await expect(page).toHaveURL(/\/saved\?page=2$/);
    await expect(page.locator("main ul > li")).toHaveCount(3);
    await expect(page.getByText("Page 2 of 2")).toBeVisible();

    // The oldest captures are on the last page.
    await expect(
      page.getByRole("link", { name: /Owner video 20/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Owner video 1\b/ }),
    ).toHaveCount(0);
    await page.getByRole("link", { name: /Previous/ }).click();
    await expect(page).toHaveURL(/\/saved$/);
  } finally {
    await context.close();
  }
});

test("renders source, description and full transcript in server HTML", async ({
  request,
}) => {
  const response = await request.get(`/saved/${sharedVideoId}`, {
    headers: { Cookie: await sessionCookie(ownerToken) },
  });
  expect(response.status()).toBe(200);

  const html = await response.text();
  // Source attribution and description.
  expect(html).toContain("Shared transcript video");
  expect(html).toContain("Seed Channel");
  expect(html).toContain("Source on YouTube");
  expect(html).toContain("An in-depth discussion about testing.");
  // Chapters as headings, ordered segments with timestamp deep links.
  expect(html).toContain("Opening");
  expect(html).toContain("Deep dive");
  expect(html).toContain("Welcome to the show");
  expect(html).toContain("Thanks for watching");
  expect(html.indexOf("Welcome to the show")).toBeLessThan(
    html.indexOf("Thanks for watching"),
  );
  expect(html).toContain("&amp;t=0s");
  expect(html).toContain("&amp;t=65s");
  // The private page is never indexed.
  expect(html).toContain("noindex, nofollow");
});

test("a shared transcript does not grant library item access", async ({
  browser,
}) => {
  const peerContext = await authenticatedContext(browser, peerToken);
  const ownerContext = await authenticatedContext(browser, ownerToken);
  const peerPage = await peerContext.newPage();
  const ownerPage = await ownerContext.newPage();

  try {
    // Both users saved the shared video, so both may read it.
    const shared = await peerPage.goto(`/saved/${sharedVideoId}`);
    expect(shared?.status()).toBe(200);
    await expect(
      peerPage.getByRole("heading", { name: "Shared transcript video" }),
    ).toBeVisible();

    // Sharing the transcript body does not expose the other user's items,
    // nonexistent videos, or the peer-only item to the owner.
    const ownersItem = await peerPage.goto(`/saved/${ownVideoIds[4]}`);
    expect(ownersItem?.status()).toBe(404);

    const nonexistent = await peerPage.goto("/saved/zzzzzzzzzzz");
    expect(nonexistent?.status()).toBe(404);

    const peerItem = await ownerPage.goto(`/saved/${peerOnlyVideoId}`);
    expect(peerItem?.status()).toBe(404);
  } finally {
    await peerContext.close();
    await ownerContext.close();
  }
});

test("keeps private pages out of robots and sitemap", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const robotsText = await robots.text();
  expect(robotsText).toContain("Disallow: /saved");
  expect(robotsText).toContain("Sitemap:");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const sitemapText = await sitemap.text();
  expect(sitemapText).toContain("<loc>");
  expect(sitemapText).not.toContain("/saved");
});
