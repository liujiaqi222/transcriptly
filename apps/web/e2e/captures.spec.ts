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
const sessionToken = `capture-${randomUUID()}`;
const secondSessionToken = `capture-${randomUUID()}`;
const userEmail = `capture-${randomUUID()}@example.test`;
const secondUserEmail = `capture-${randomUUID()}@example.test`;
const videoId = "dQw4w9WgXcQ";
const capturedAt = "2026-08-20T10:00:00.000Z";

function capture(
  id = videoId,
  at = capturedAt,
  text = "Hello from the cloud",
  channelUrl = "https://www.youtube.com/@capture-test",
) {
  return {
    source: {
      videoId: id,
      url: `https://www.youtube.com/watch?v=${id}`,
      title: "Capture test",
      channelName: "Capture channel",
      channelUrl,
      description: "Description must not appear in logs.",
    },
    capturedAt: at,
    segments: [{ start: 0, text }],
  };
}

let sql: ReturnType<typeof postgres>;

test.beforeAll(async () => {
  sql = postgres(databaseUrl, { max: 1 });
  const now = new Date();
  await sql`
    insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${userId}, 'Capture User', ${userEmail}, true, ${now}, ${now})
  `;
  await sql`
    insert into "session" (id, token, user_id, expires_at, created_at, updated_at)
    values (${randomUUID()}, ${sessionToken}, ${userId}, ${new Date(now.getTime() + 3600000)}, ${now}, ${now})
  `;
  await sql`
    insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${secondUserId}, 'Second Capture User', ${secondUserEmail}, true, ${now}, ${now})
  `;
  await sql`
    insert into "session" (id, token, user_id, expires_at, created_at, updated_at)
    values (${randomUUID()}, ${secondSessionToken}, ${secondUserId}, ${new Date(now.getTime() + 3600000)}, ${now}, ${now})
  `;
});

test.afterAll(async () => {
  await sql`delete from "user" where id in (${userId}, ${secondUserId})`;
  await sql.end();
});

test("creates a private item and returns the cloud success envelope", async ({
  request,
}) => {
  const signature = await makeSignature(sessionToken, authSecret);
  const response = await request.post("/api/v1/captures", {
    headers: {
      Origin: baseURL,
      Cookie: `better-auth.session_token=${sessionToken}.${signature}`,
      "Content-Type": "application/json",
    },
    data: capture(),
  });

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  await expect(response.json()).resolves.toEqual(
    expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        videoId,
        outcome: "created",
        currentCapturedAt: capturedAt,
      }),
    }),
  );

  const rows = await sql`
    select li.visibility, li.captured_at, count(s.id)::int as segment_count
    from library_items li
    join transcripts t on t.id = li.transcript_id
    join segments s on s.transcript_id = t.id
    where li.user_id = ${userId}
      and li.video_id = (select id from canonical_videos where youtube_video_id = ${videoId})
    group by li.visibility, li.captured_at
  `;
  expect(rows).toEqual([
    expect.objectContaining({ visibility: "private", segment_count: 1 }),
  ]);
});

test("rejects unauthenticated, wrong media type, oversized and invalid requests", async ({
  request,
}) => {
  const common = { Origin: baseURL };
  const unauthenticated = await request.post("/api/v1/captures", {
    headers: { ...common, "Content-Type": "application/json" },
    data: capture("M7lc1UVf-VE"),
  });
  expect(unauthenticated.status()).toBe(401);

  const wrongType = await request.post("/api/v1/captures", {
    headers: {
      ...common,
      Cookie: await sessionCookie(),
      "Content-Type": "text/plain",
    },
    data: "{}",
  });
  expect(wrongType.status()).toBe(415);

  const oversized = await request.post("/api/v1/captures", {
    headers: {
      ...common,
      Cookie: await sessionCookie(),
      "Content-Type": "application/json",
    },
    data: { ...capture("M7lc1UVf-VE"), padding: "x".repeat(10 * 1024 * 1024) },
  });
  expect(oversized.status()).toBe(413);

  const invalid = await request.post("/api/v1/captures", {
    headers: {
      ...common,
      Cookie: await sessionCookie(),
      "Content-Type": "application/json",
    },
    data: { ...capture("M7lc1UVf-VE"), unknown: true },
  });
  expect(invalid.status()).toBe(400);
});

async function sessionCookie(token = sessionToken): Promise<string> {
  const signature = await makeSignature(token, authSecret);
  return `better-auth.session_token=${token}.${signature}`;
}

test("rejects captures more than ten minutes in the future", async ({
  request,
}) => {
  const response = await request.post("/api/v1/captures", {
    headers: {
      Origin: baseURL,
      Cookie: await sessionCookie(),
      "Content-Type": "application/json",
    },
    data: capture(videoId, "2030-01-01T00:00:00.000Z"),
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).error.code).toBe("captured_at_in_future");
});

test("rolls back all writes when a database write fails", async ({
  request,
}) => {
  await sql.unsafe(`
    create or replace function test_capture_failure() returns trigger
    language plpgsql as $$ begin raise exception 'capture test failure'; end $$;
    create trigger test_capture_failure_trigger
      before insert on segments
      for each row execute function test_capture_failure();
  `);

  try {
    const rollbackVideoId = "9bZkp7q19f0";
    const response = await request.post("/api/v1/captures", {
      headers: {
        Origin: baseURL,
        Cookie: await sessionCookie(),
        "Content-Type": "application/json",
      },
      data: capture(rollbackVideoId),
    });
    expect(response.status()).toBe(500);

    const rows = await sql`
      select
        (select count(*)::int from canonical_videos where youtube_video_id = ${rollbackVideoId}) as videos,
        (select count(*)::int from library_items where user_id = ${userId}) as items,
        (select count(*)::int from transcripts where video_id = (select id from canonical_videos where youtube_video_id = ${rollbackVideoId})) as transcripts,
        (select count(*)::int from segments where transcript_id in (select id from transcripts where video_id = (select id from canonical_videos where youtube_video_id = ${rollbackVideoId}))) as segments
    `;
    expect(rows[0]).toEqual({
      videos: 0,
      items: 1,
      transcripts: 0,
      segments: 0,
    });
  } finally {
    await sql.unsafe(`
      drop trigger if exists test_capture_failure_trigger on segments;
      drop function if exists test_capture_failure();
    `);
  }
});

test("rechecks same-user concurrent requests after advisory locking", async ({
  request,
}) => {
  const concurrentVideoId = "BaW_11grc1I";
  const responses = await Promise.all([
    request.post("/api/v1/captures", {
      headers: {
        Origin: baseURL,
        Cookie: await sessionCookie(),
        "Content-Type": "application/json",
      },
      data: capture(concurrentVideoId, "2026-08-20T11:00:00.000Z", "First"),
    }),
    request.post("/api/v1/captures", {
      headers: {
        Origin: baseURL,
        Cookie: await sessionCookie(),
        "Content-Type": "application/json",
      },
      data: capture(concurrentVideoId, "2026-08-20T12:00:00.000Z", "Second"),
    }),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([
    200, 200,
  ]);

  const rows = await sql`
    select li.captured_at, count(*)::int as items
    from library_items li
    join canonical_videos cv on cv.id = li.video_id
    where li.user_id = ${userId} and cv.youtube_video_id = ${concurrentVideoId}
    group by li.captured_at
  `;
  expect(rows).toEqual([
    { captured_at: new Date("2026-08-20T12:00:00.000Z"), items: 1 },
  ]);
});

test("handles duplicate, stale and timestamp conflict atomically", async ({
  request,
}) => {
  const headers = {
    Origin: baseURL,
    Cookie: await sessionCookie(),
    "Content-Type": "application/json",
  };

  const duplicate = await request.post("/api/v1/captures", {
    headers,
    data: capture(),
  });
  expect(duplicate.status()).toBe(200);
  expect((await duplicate.json()).data).toEqual(
    expect.objectContaining({ outcome: "unchanged", reason: "duplicate" }),
  );

  const conflict = await request.post("/api/v1/captures", {
    headers,
    data: capture(videoId, capturedAt, "Different body"),
  });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).error).toEqual(
    expect.objectContaining({
      code: "capture_timestamp_conflict",
      retryable: false,
    }),
  );

  const countsAfterConflict = await sql`
    select
      (select count(*)::int
       from library_items li
       join canonical_videos cv on cv.id = li.video_id
       where li.user_id = ${userId} and cv.youtube_video_id = ${videoId}) as items,
      (select count(*)::int
       from transcripts t
       join canonical_videos cv on cv.id = t.video_id
       where cv.youtube_video_id = ${videoId}) as transcripts,
      (select count(*)::int
       from segments s
       join transcripts t on t.id = s.transcript_id
       join canonical_videos cv on cv.id = t.video_id
       where cv.youtube_video_id = ${videoId}) as segments
  `;
  expect(countsAfterConflict[0]).toEqual({
    items: 1,
    transcripts: 1,
    segments: 1,
  });

  const stale = await request.post("/api/v1/captures", {
    headers,
    data: capture(videoId, "2026-08-20T09:59:00.000Z", "Older body"),
  });
  expect(stale.status()).toBe(200);
  expect((await stale.json()).data).toEqual(
    expect.objectContaining({ outcome: "unchanged", reason: "stale" }),
  );

  const updated = await request.post("/api/v1/captures", {
    headers,
    data: capture(videoId, "2026-08-20T10:01:00.000Z", "Newer body", ""),
  });
  expect(updated.status()).toBe(200);
  expect((await updated.json()).data).toEqual(
    expect.objectContaining({ outcome: "updated" }),
  );

  const canonical = await sql`
    select channel_url, source_captured_at
    from canonical_videos where youtube_video_id = ${videoId}
  `;
  expect(canonical[0]?.channel_url).toBe(
    "https://www.youtube.com/@capture-test",
  );

  const secondUser = await request.post("/api/v1/captures", {
    headers: {
      Origin: baseURL,
      Cookie: await sessionCookie(secondSessionToken),
      "Content-Type": "application/json",
    },
    data: capture(videoId, "2026-08-20T10:02:00.000Z", "Newer body", ""),
  });
  expect(secondUser.status()).toBe(200);
  const transcriptCount = await sql`
    select count(*)::int as count from transcripts
    where video_id = (select id from canonical_videos where youtube_video_id = ${videoId})
  `;
  expect(transcriptCount[0]?.count).toBe(2);
  const sharedBodies = await sql`
    select count(*)::int as count
    from library_items li
    join library_items owner_item
      on owner_item.transcript_id = li.transcript_id
     and owner_item.user_id = ${userId}
     and owner_item.video_id = li.video_id
    join canonical_videos cv on cv.id = li.video_id
    where cv.youtube_video_id = ${videoId}
  `;
  expect(sharedBodies[0]?.count).toBe(2);
});
