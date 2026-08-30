# Chrome Web Store release

The extension ID is the pivot of the extension<->server trust chain: the
server only accepts writes from `chrome-extension://<id>` (see the
Extension origin boundary doc), so the ID must be identical everywhere.

## How the ID is pinned

The manifest `key` (public key DER, base64) is hardcoded in
`apps/extension/wxt.config.ts`. Chrome derives the extension ID as
SHA256(key DER), first 16 bytes, hex digits mapped `0-f` -> `a-p`.

Because the key ships in the manifest, the unpacked dev build, the
packaged ZIP, and (per the store's handling of the `key` field) the
published item derive the same ID: **nieojpobkpchdjmijgdgnnllkggijbdh**.

The server allowlists the matching origin in:

- `.github/workflows/deploy.yml` (production; baked into the image via
  the `EXTENSION_ORIGINS` build-arg)
- `.env.example` / `.env` / `apps/web/.env.local` (local dev)
- `apps/web/src/lib/api/origin-allowlist.test.ts` (regression test)

`pnpm release` re-verifies that the manifest key still derives to this
ID and that the committed allowlist files carry it, so key/allowlist
drift fails the build instead of silently breaking extension writes.

## First-upload checklist (manual, once)

The official flow is: create the item in the Chrome Web Store Dashboard,
upload the first ZIP draft, and only then reconcile IDs - the Dashboard
assigns the item ID at creation and it cannot be changed afterwards.
After uploading the first draft of a new item, verify all three agree:

1. **Chrome Web Store Item ID**: Dashboard -> Package -> Item ID
2. **manifest key derived ID**: `pnpm release` prints `ext id:` - or
   check locally that the loaded unpacked extension shows the same ID
   on `chrome://extensions`
3. **Server `EXTENSION_ORIGINS`**: the value in `deploy.yml` (and local
   env files)

### If the store item ID differs

The dashboard's ID wins - it cannot be edited. In that order:

1. Copy the store's public key (Dashboard -> Package, or from the
   published CRX) into `manifest.key` in `wxt.config.ts`, so future
   builds derive the store's ID.
2. Update `EXTENSION_ORIGINS` to `chrome-extension://<store-id>` in
   `deploy.yml`, `.env.example`, `.env`, `apps/web/.env.local`, and
   `origin-allowlist.test.ts`.
3. Update `EXPECTED_EXTENSION_ID` in
   `apps/extension/scripts/release.mjs`.
4. Re-run `pnpm release` (must pass), `pnpm --filter @transcriptly/web
   test`, and redeploy the web app before publishing the extension:
   the extension's writes fail origin checks until the server accepts
   the new origin.

## Publishing an update

1. Bump the version in both `package.json` files.
2. `pnpm release` - must pass all checks.
3. Upload the printed ZIP path in the Dashboard.
4. No ID work needed: the key, allowlists, and store item already agree.
