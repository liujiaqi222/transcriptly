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
  if (!value) {
    throw new Error(`The web E2E runner did not provide ${name}.`);
  }
  return value;
}

const databaseUrl = requiredEnvironment("DATABASE_URL");
const authSecret = requiredEnvironment("BETTER_AUTH_SECRET");
const baseURL = requiredEnvironment("WEB_E2E_BASE_URL");

const userId = randomUUID();
const firstSessionToken = `first-${randomUUID()}`;
const secondSessionToken = `second-${randomUUID()}`;
const userEmail = "library-user@example.test";

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

test.beforeAll(async () => {
  const sql = postgres(databaseUrl, { max: 1 });
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

  try {
    await sql.begin(async (transaction) => {
      await transaction`
        insert into "user" (
          id, name, email, email_verified, created_at, updated_at
        ) values (
          ${userId}, 'Library User', ${userEmail}, true, ${now}, ${now}
        )
      `;
      await transaction`
        insert into "session" (
          id, token, user_id, expires_at, created_at, updated_at
        ) values
          (${randomUUID()}, ${firstSessionToken}, ${userId}, ${expiresAt}, ${now}, ${now}),
          (${randomUUID()}, ${secondSessionToken}, ${userId}, ${expiresAt}, ${now}, ${now})
      `;
    });
  } finally {
    await sql.end();
  }
});

test("unauthenticated visitor enters the sign-in flow", async ({ page }) => {
  await page.goto("/saved");

  await expect(page).toHaveURL(/\/sign-in\?callbackURL=%2Fsaved$/);
  await expect(
    page.getByRole("heading", { name: "Sign in to your transcripts." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeVisible();
});

test("database session grants access to the private empty library", async ({
  browser,
}) => {
  const context = await authenticatedContext(browser, firstSessionToken);
  const page = await context.newPage();

  try {
    await page.goto("/saved");

    await expect(page).toHaveURL(/\/saved$/);
    await expect(
      page.getByRole("heading", { name: "Nothing saved yet" }),
    ).toBeVisible();
    await expect(page.getByText(userEmail)).toBeVisible();
  } finally {
    await context.close();
  }
});

test("sign-out ends only the current browser session", async ({ browser }) => {
  const firstContext = await authenticatedContext(browser, firstSessionToken);
  const secondContext = await authenticatedContext(browser, secondSessionToken);
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();

  try {
    await firstPage.goto("/saved");
    await secondPage.goto("/saved");

    await firstPage.getByRole("button", { name: "Sign out" }).click();
    await expect(firstPage).toHaveURL(/\/sign-in$/);

    await firstPage.goto("/saved");
    await expect(firstPage).toHaveURL(/\/sign-in\?callbackURL=%2Fsaved$/);

    await secondPage.reload();
    await expect(secondPage).toHaveURL(/\/saved$/);
    await expect(
      secondPage.getByRole("heading", { name: "Nothing saved yet" }),
    ).toBeVisible();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
