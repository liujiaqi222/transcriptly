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
const thirdUserId = randomUUID();
const sessionToken = `contribution-${randomUUID()}`;
const secondSessionToken = `contribution-${randomUUID()}`;
const thirdSessionToken = `contribution-${randomUUID()}`;
const videoId = "M7lc1UVf-VE";
const punctuationVideoId = "dQw4w9WgXcQ";

const capture = {
  source: {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: "Public archive E2E transcript",
    channelName: "Transcriptly Test Channel",
    channelHandle: "/@transcriptly-test",
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

/** A later, differently-worded capture of the same video (#73). */
const replacementCapture = {
  ...capture,
  capturedAt: "2026-08-20T11:00:00.000Z",
  segments: [
    { start: 0, text: "Replacement transcript about observable convergence." },
    { start: 50, text: "The latest qualified capture wins the publication." },
  ],
  chapters: [{ start: 0, title: "Latest qualified" }],
};

const punctuatedChannelCapture = {
  ...capture,
  source: {
    ...capture.source,
    videoId: punctuationVideoId,
    url: `https://www.youtube.com/watch?v=${punctuationVideoId}`,
    title: "Punctuated channel slug transcript",
    channelName: "Transcriptly Underscore Channel",
    channelHandle: "/@transcriptly_test",
  },
  capturedAt: "2026-08-20T13:00:00.000Z",
};

/** Two distinct captures raced by different users in the concurrency test. */
const concurrentFirstCapture = {
  ...capture,
  capturedAt: "2026-08-20T12:00:00.000Z",
  segments: [
    { start: 0, text: "Concurrency race candidate one claims the version." },
    { start: 30, text: "Only one transcript may remain current." },
  ],
};

const concurrentSecondCapture = {
  ...capture,
  capturedAt: "2026-08-20T12:01:00.000Z",
  segments: [
    { start: 0, text: "Concurrency race candidate two claims the version." },
    { start: 30, text: "Only one transcript may remain current." },
  ],
};

let sql: ReturnType<typeof postgres>;

async function sessionCookie(token = sessionToken): Promise<string> {
  const signature = await makeSignature(token, authSecret);
  return `better-auth.session_token=${token}.${signature}`;
}

/** The cookie value only - the signature may itself contain "=" padding. */
async function sessionCookieValue(token = sessionToken): Promise<string> {
  const cookie = await sessionCookie(token);
  return cookie.slice(cookie.indexOf("=") + 1);
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
  await sql`
    insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${thirdUserId}, 'Third Contributor', ${`third-public-${randomUUID()}@example.test`}, true, ${now}, ${now})
  `;
  await sql`
    insert into "session" (id, token, user_id, expires_at, created_at, updated_at)
    values (${randomUUID()}, ${thirdSessionToken}, ${thirdUserId}, ${new Date(now.getTime() + 3600000)}, ${now}, ${now})
  `;
});

test.afterAll(async () => {
  await sql`
    delete from public_publications
    where video_id in (
      select id
      from canonical_videos
      where youtube_video_id in (${videoId}, ${punctuationVideoId})
    )
  `;
  await sql`delete from "user" where id in (${userId}, ${secondUserId}, ${thirdUserId})`;
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
  console.error(
    "PROBE t270 start consents:",
    JSON.stringify(await sql`select user_id from public_profile_consents`),
  );
  await page.goto(`/transcripts/${videoId}`);
  console.error(
    "PROBE t270 after detail goto consents:",
    JSON.stringify(await sql`select user_id from public_profile_consents`),
  );
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

  console.error(
    "PROBE t270 before search goto consents:",
    JSON.stringify(await sql`select user_id from public_profile_consents`),
  );
  await page.goto("/transcripts?q=observable");
  await expect(
    page.getByText("Observable behavior makes agent systems reliable."),
  ).toBeVisible();
  expect(await page.locator("a a").count()).toBe(0);

  await page.goto("/transcripts");
  await expect(
    page.getByRole("link", { name: "Public archive E2E transcript" }),
  ).toBeVisible();
  expect(await page.locator("a a").count()).toBe(0);

  await page.goto("/transcripts?scope=videos&q=%25");
  await expect(page.getByText("No videos match “%”")).toBeVisible();
  await expect(page.getByText("Public archive E2E transcript")).toHaveCount(0);

  expect(
    (
      await request.get("/transcripts?page=999999999999999999999999999999999")
    ).status(),
  ).toBe(404);

  await page.goto("/channels");
  await expect(
    page.getByRole("link", { name: "Transcriptly Test Channel" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Public archive E2E transcript" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-channel-avatar]", { hasText: "T" }),
  ).toBeVisible();

  await page.goto("/channels/transcriptly-test");
  await expect(
    page.getByRole("heading", { name: "Transcriptly Test Channel" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-channel-avatar]", { hasText: "T" }),
  ).toBeVisible();
  expect(
    (
      await request.get(
        "/channels/transcriptly-test?page=999999999999999999999999999999999",
      )
    ).status(),
  ).toBe(404);

  const sitemap = await request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain(`/transcripts/${videoId}`);

  await sql`
    update public_publications
    set active = false
    where video_id = (select id from canonical_videos where youtube_video_id = ${videoId})
  `;
  expect((await request.get(`/transcripts/${videoId}`)).status()).toBe(404);
  expect(
    await (await request.get("/transcripts?q=observable")).text(),
  ).not.toContain("Observable behavior makes agent systems reliable.");
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain(
    `/transcripts/${videoId}`,
  );
});

test("rejects empty and duplicated transcripts with specific failures (#73)", async ({
  request,
}) => {
  const headers = {
    Origin: baseURL,
    Cookie: await sessionCookie(),
    "Content-Type": "application/json",
  };

  const empty = await request.post("/api/v1/contributions", {
    headers,
    data: {
      capture: { ...capture, segments: [] },
      targetVideoId: videoId,
    },
  });
  expect(empty.status()).toBe(422);
  expect((await empty.json()).error.code).toBe("empty_transcript");

  const duplicated = await request.post("/api/v1/contributions", {
    headers,
    data: {
      capture: {
        ...capture,
        segments: [...capture.segments, ...capture.segments],
      },
      targetVideoId: videoId,
    },
  });
  expect(duplicated.status()).toBe(422);
  expect((await duplicated.json()).error.code).toBe("duplicate_transcript");

  // Rejections leave no trace: neither a Contribution row nor a Transcript
  // version was created for the faulty captures.
  const rows = await sql`
    select
      (select count(*)::int from transcripts t join canonical_videos cv on cv.id = t.video_id where cv.youtube_video_id = ${videoId}) as transcripts
  `;
  expect(rows[0].transcripts).toBe(1);
});

test("replaces the current publication with the latest qualified capture and prunes older transcripts (#73)", async ({
  page,
  request,
}) => {
  // The previous test unpublished the video; a new qualified contribution
  // from the second contributor replaces the transcript and republishes.
  const replaced = await request.post("/api/v1/contributions", {
    headers: {
      Origin: baseURL,
      Cookie: await sessionCookie(secondSessionToken),
      "Content-Type": "application/json",
    },
    data: { capture: replacementCapture, targetVideoId: videoId },
  });
  expect(replaced.status()).toBe(200);
  expect((await replaced.json()).data).toEqual(
    expect.objectContaining({ videoId, outcome: "replaced" }),
  );

  // Exactly one current publication and one referenced transcript remain;
  // the older transcript content is pruned only after the new publication
  // is durable, and every contributor stays attributed at the video level.
  const rows = await sql`
    select
      (select count(*)::int from contributions c join canonical_videos cv on cv.id = c.video_id where cv.youtube_video_id = ${videoId}) as contributions,
      (select count(*)::int from public_publications pp join canonical_videos cv on cv.id = pp.video_id where cv.youtube_video_id = ${videoId}) as publications,
      (select count(*)::int from transcripts t join canonical_videos cv on cv.id = t.video_id where cv.youtube_video_id = ${videoId}) as transcripts,
      (select pp.active from public_publications pp join canonical_videos cv on cv.id = pp.video_id where cv.youtube_video_id = ${videoId}) as active,
      (select count(*)::int from segments s join transcripts t on t.id = s.transcript_id join canonical_videos cv on cv.id = t.video_id where cv.youtube_video_id = ${videoId}) as segments
  `;
  expect(rows[0]).toEqual({
    contributions: 2,
    publications: 1,
    transcripts: 1,
    active: true,
    segments: 2,
  });

  // The public surface serves the replacement with the new attribution.
  await page.goto(`/transcripts/${videoId}`);
  await expect(
    page.getByRole("heading", { name: "Public archive E2E transcript" }),
  ).toBeVisible();
  await expect(
    page.getByText("The latest qualified capture wins the publication."),
  ).toBeVisible();
  await expect(
    page.getByText("Contributed by Second Contributor"),
  ).toBeVisible();
  await expect(
    page.getByText("Observable behavior makes agent systems reliable."),
  ).toHaveCount(0);

  // A same-content retry stays idempotent: no swap, no churn.
  const retry = await request.post("/api/v1/contributions", {
    headers: {
      Origin: baseURL,
      Cookie: await sessionCookie(secondSessionToken),
      "Content-Type": "application/json",
    },
    data: { capture: replacementCapture, targetVideoId: videoId },
  });
  expect((await retry.json()).data.outcome).toBe("unchanged");
  const afterRetry = await sql`
    select count(*)::int as transcripts
    from transcripts t join canonical_videos cv on cv.id = t.video_id
    where cv.youtube_video_id = ${videoId}
  `;
  expect(afterRetry[0].transcripts).toBe(1);
});

test("converges deterministically under concurrent contributions (#73)", async ({
  request,
}) => {
  const contribute = (capturePayload: unknown, cookie: string) =>
    request.post("/api/v1/contributions", {
      headers: {
        Origin: baseURL,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      data: { capture: capturePayload, targetVideoId: videoId },
    });

  // Two different captures race for the same video. The server-received
  // sequence under the per-video lock decides the winner: the last
  // transaction to commit owns the current version.
  const [first, second] = await Promise.all([
    contribute(concurrentFirstCapture, await sessionCookie()),
    contribute(
      concurrentSecondCapture,
      await sessionCookie(secondSessionToken),
    ),
  ]);
  expect(first.status()).toBe(200);
  expect(second.status()).toBe(200);
  expect([
    (await first.json()).data.outcome,
    (await second.json()).data.outcome,
  ]).toEqual(["replaced", "replaced"]);

  // Deterministic convergence: one publication, exactly one referenced
  // complete transcript (bounded retention), and the current version is one
  // of the raced captures - never a mix, never a duplicate publication.
  const rows = await sql`
    select
      (select count(*)::int from public_publications pp join canonical_videos cv on cv.id = pp.video_id where cv.youtube_video_id = ${videoId}) as publications,
      (select count(*)::int from transcripts t join canonical_videos cv on cv.id = t.video_id where cv.youtube_video_id = ${videoId}) as transcripts,
      (select count(*)::int from contributions c join canonical_videos cv on cv.id = c.video_id where cv.youtube_video_id = ${videoId}) as contributions,
      (select s.text from segments s join public_publications pp on pp.current_transcript_id = s.transcript_id join canonical_videos cv on cv.id = pp.video_id join transcripts t on t.id = s.transcript_id where cv.youtube_video_id = ${videoId} and s.position = 0) as current_first_segment
  `;
  expect(rows[0].publications).toBe(1);
  expect(rows[0].transcripts).toBe(1);
  expect(rows[0].contributions).toBe(2);
  expect([
    "Concurrency race candidate one claims the version.",
    "Concurrency race candidate two claims the version.",
  ]).toContain(rows[0].current_first_segment);

  // Retrying the winner after the race changes nothing: the outcome is
  // idempotent and retention stays bounded.
  const winnerCapture = rows[0].current_first_segment.includes("candidate one")
    ? concurrentFirstCapture
    : concurrentSecondCapture;
  const winnerCookie = rows[0].current_first_segment.includes("candidate one")
    ? await sessionCookie()
    : await sessionCookie(secondSessionToken);
  const retry = await request.post("/api/v1/contributions", {
    headers: {
      Origin: baseURL,
      Cookie: winnerCookie,
      "Content-Type": "application/json",
    },
    data: { capture: winnerCapture, targetVideoId: videoId },
  });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).data.outcome).toBe("unchanged");
  const afterRetry = await sql`
    select count(*)::int as transcripts
    from transcripts t join canonical_videos cv on cv.id = t.video_id
    where cv.youtube_video_id = ${videoId}
  `;
  expect(afterRetry[0].transcripts).toBe(1);
});

test("serves My contributions at /contributions with a session-gated entry (#74)", async ({
  page,
}) => {
  // Signed out: the page redirects to sign-in and the home header offers
  // the account entry as "Sign in".
  await page.goto("/contributions");
  await expect(page).toHaveURL(/\/sign-in\?callbackURL=%2Fcontributions$/);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/sign-in?callbackURL=%2Fcontributions",
  );

  // Signed in: the home header opens My contributions, and the page lists
  // each currently active user-by-video Contribution exactly once.
  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: await sessionCookieValue(),
      url: baseURL,
    },
  ]);
  await page.goto("/");
  const accountEntry = page.getByRole("link", {
    name: "My contributions",
  });
  await expect(accountEntry).toHaveAttribute("href", "/contributions");
  // The entry shows the signed-in identity - avatar plus display name -
  // not a generic label.
  await expect(page.getByText("Public Contributor")).toBeVisible();
  await expect(accountEntry.locator("img")).toHaveCount(1);

  await page.goto("/contributions");
  await expect(
    page.getByRole("heading", { name: "Videos you keep in the archive." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Public archive E2E transcript" }),
  ).toHaveCount(1);
  await expect(page.getByText("Transcriptly Test Channel")).toBeVisible();
});

test("rejects withdrawal without a session, origin, or own contribution (#74)", async ({
  request: api,
}) => {
  // Mutations stay strict: a missing Origin is rejected outright.
  const noOrigin = await api.delete(`/api/v1/contributions/${videoId}`, {
    headers: { Cookie: await sessionCookie() },
  });
  expect(noOrigin.status()).toBe(403);

  const noSession = await api.delete(`/api/v1/contributions/${videoId}`, {
    headers: { Origin: baseURL },
  });
  expect(noSession.status()).toBe(401);

  const invalidVideo = await api.delete("/api/v1/contributions/short", {
    headers: { Origin: baseURL, Cookie: await sessionCookie() },
  });
  expect(invalidVideo.status()).toBe(400);

  // A signed-in user cannot withdraw someone else's contribution.
  const stranger = await api.delete(`/api/v1/contributions/${videoId}`, {
    headers: {
      Origin: baseURL,
      Cookie: await sessionCookie(thirdSessionToken),
    },
  });
  expect(stranger.status()).toBe(404);
  expect((await stranger.json()).error.code).toBe("contribution_not_found");

  // None of the rejections touched the contribution.
  const rows = await sql`
    select count(*)::int as contributions
    from contributions c join canonical_videos cv on cv.id = c.video_id
    where cv.youtube_video_id = ${videoId}
  `;
  expect(rows[0].contributions).toBe(2);
});

test("requires confirmation before removing a contribution in the UI (#74)", async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: await sessionCookieValue(),
      url: baseURL,
    },
  ]);
  await page.goto("/contributions");
  const remove = page.getByRole("button", { name: "Remove" });
  await remove.click();

  // The first click only opens the confirmation dialog and explains the
  // stakes; Cancel closes it without changing anything.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(/If you are the only contributor/),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).not.toBeVisible();

  // The second explicit confirmation commits the withdrawal.
  await remove.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Remove contribution" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("link", { name: "Public archive E2E transcript" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("You have not contributed to any videos yet."),
  ).toBeVisible();
});

test("keeps the publication and transcript when another contributor remains (#74)", async ({
  page,
}) => {
  // The second contributor still holds the video: publication active,
  // transcript intact, attribution moved off the withdrawn user.
  const rows = await sql`
    select
      (select count(*)::int from contributions c join canonical_videos cv on cv.id = c.video_id where cv.youtube_video_id = ${videoId}) as contributions,
      (select count(*)::int from public_publications pp join canonical_videos cv on cv.id = pp.video_id where cv.youtube_video_id = ${videoId}) as publications,
      (select count(*)::int from transcripts t join canonical_videos cv on cv.id = t.video_id where cv.youtube_video_id = ${videoId}) as transcripts,
      (select u.name from public_publications pp join contributions c on c.id = pp.contribution_id join "user" u on u.id = c.user_id join canonical_videos cv on cv.id = pp.video_id where cv.youtube_video_id = ${videoId}) as attributed_to,
      (select pp.active from public_publications pp join canonical_videos cv on cv.id = pp.video_id where cv.youtube_video_id = ${videoId}) as active
  `;
  expect(rows[0]).toEqual({
    contributions: 1,
    publications: 1,
    transcripts: 1,
    attributed_to: "Second Contributor",
    active: true,
  });

  await page.goto(`/transcripts/${videoId}`);
  await expect(
    page.getByText("Contributed by Second Contributor"),
  ).toBeVisible();
});

test("unpublishes the video and deletes the transcript when the final contributor leaves (#74)", async ({
  page,
  request: api,
}) => {
  const final = await api.delete(`/api/v1/contributions/${videoId}`, {
    headers: {
      Origin: baseURL,
      Cookie: await sessionCookie(secondSessionToken),
    },
  });
  expect(final.status()).toBe(200);
  await expect(final.json()).resolves.toMatchObject({
    success: true,
    data: { videoId, outcome: "unpublished", remainingContributors: 0 },
  });

  // Contribution, publication, and transcript content are all gone; the
  // public surfaces (detail, search, sitemap) no longer expose the video.
  const rows = await sql`
    select
      (select count(*)::int from contributions c join canonical_videos cv on cv.id = c.video_id where cv.youtube_video_id = ${videoId}) as contributions,
      (select count(*)::int from public_publications pp join canonical_videos cv on cv.id = pp.video_id where cv.youtube_video_id = ${videoId}) as publications,
      (select count(*)::int from transcripts t join canonical_videos cv on cv.id = t.video_id where cv.youtube_video_id = ${videoId}) as transcripts,
      (select count(*)::int from segments s join transcripts t on t.id = s.transcript_id join canonical_videos cv on cv.id = t.video_id where cv.youtube_video_id = ${videoId}) as segments
  `;
  expect(rows[0]).toEqual({
    contributions: 0,
    publications: 0,
    transcripts: 0,
    segments: 0,
  });

  expect((await api.get(`/transcripts/${videoId}`)).status()).toBe(404);
  expect(await (await api.get("/?q=observable")).text()).not.toContain(
    "Observable behavior makes agent systems reliable.",
  );
  expect(await (await api.get("/sitemap.xml")).text()).not.toContain(
    `/transcripts/${videoId}`,
  );

  // Withdrawing again is a 404, not a second unpublish.
  const again = await api.delete(`/api/v1/contributions/${videoId}`, {
    headers: {
      Origin: baseURL,
      Cookie: await sessionCookie(secondSessionToken),
    },
  });
  expect(again.status()).toBe(404);

  // A later qualified contribution republishes from scratch.
  const republished = await api.post("/api/v1/contributions", {
    headers: {
      Origin: baseURL,
      Cookie: await sessionCookie(),
      "Content-Type": "application/json",
    },
    data: { capture: replacementCapture, targetVideoId: videoId },
  });
  expect(republished.status()).toBe(200);
  expect((await republished.json()).data.outcome).toBe("published");
  await page.goto(`/transcripts/${videoId}`);
  await expect(
    page.getByText("The latest qualified capture wins the publication."),
  ).toBeVisible();
});

test("preserves handle punctuation in channel slugs", async ({ request }) => {
  const response = await request.post("/api/v1/contributions", {
    headers: {
      Origin: baseURL,
      Cookie: await sessionCookie(),
      "Content-Type": "application/json",
    },
    data: {
      capture: punctuatedChannelCapture,
      targetVideoId: punctuationVideoId,
    },
  });
  expect(response.status()).toBe(200);

  const rows = await sql`
    select handle, slug
    from channels
    where handle in ('/@transcriptly-test', '/@transcriptly_test')
    order by handle
  `;
  expect(rows).toHaveLength(2);
  expect(rows).toEqual([
    { handle: "/@transcriptly-test", slug: "transcriptly-test" },
    { handle: "/@transcriptly_test", slug: "transcriptly_test" },
  ]);
});
