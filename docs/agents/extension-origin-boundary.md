# Extension origin boundary

Extension background fetches to the web app run under `host_permissions`, which bypasses CORS entirely. CORS is what makes browsers attach an `Origin` header to GET requests, so these GETs arrive with **no `Origin` at all**. POSTs always carry `Origin` (Fetch spec, independent of CORS). A route that rejects a missing origin therefore breaks reads while writes keep working — the failure is invisible because clients degrade it on purpose.

## Rules

- **Mutations keep the strict allowlist.** POST/PATCH/DELETE routes reject a missing `Origin`; the allowlist on writes is the CSRF boundary. Never relax it.
- **Read-only, cookie-authenticated GETs the extension calls accept a missing `Origin`.** The safety argument does not need the allowlist: `SameSite=Lax` stops other websites' fetches from attaching the session cookie, the website's own requests always present an allowlisted `Origin`, so a valid cookie without `Origin` can only come from the extension background (or a curl — acceptable for a read with no side effects).
- **Never set `Origin` from fetch.** It is a forbidden header name; the browser strips it. The fix is always on the route side.
- **Reads degrade to the safe default, never to a crash.** A failed session/status fetch returns "unknown", which may re-ask a one-time question (e.g. the public-contribution disclosure) but must not block local saves.

## Regression contract

Keep these covered when touching the boundary (`apps/web/e2e/contributions.spec.ts`):

1. GET with a valid session cookie and no `Origin` header → 200 with the full payload.
2. GET with a disallowed `Origin` → 403.
3. POST without `Origin` → 403.

## Incident signature

- **Symptom**: the extension looks fully signed in (email renders, uploads succeed) while a server-side fact read over GET never arrives — e.g. the one-time public-contribution confirmation reappears on every popup open even though the database has the consent row.
- **Root cause**: `host_permissions` CORS bypass strips `Origin` from GETs; the route's allowlist returned 403; the client's catch collapsed it to "unknown".
- **Defense**: read routes allow a missing `Origin`; writes stay strict. Both sides covered by the regression contract above.

## Diagnosis recipe

1. Verify the server's data directly (psql) to separate storage from transport.
2. Call the route twice with a signed session cookie — once with the extension's `Origin`, once without. Differing results pin the failure to the Origin contract, not the client.
3. Only then look at the extension: built bundles under `.output/chrome-mv3*/` must contain the endpoint and field mapping (watch for stale builds from other worktrees).
