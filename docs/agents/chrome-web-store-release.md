# Chrome Web Store release

The extension ID is the pivot of the extension<->server trust chain: the
server only accepts writes from `chrome-extension://<id>` (see the
Extension origin boundary doc), so the ID must be identical everywhere.

## Development ID and store ID

The manifest `key` (public key DER, base64) is hardcoded in
`apps/extension/wxt.config.ts`. Chrome derives the extension ID as
SHA256(key DER), first 16 bytes, hex digits mapped `0-f` -> `a-p`.

The key keeps unpacked development builds on the Chrome Web Store item ID:
**jkopejjjgdkkacabdhgdlploehikphai**.

Chrome Web Store upload validation rejects a submitted manifest containing
`key`, so `pnpm release` validates the configured key and then removes the
field while rebuilding the final store ZIP. The published extension uses the
Dashboard item's ID. After the first successful upload, the Dashboard item ID
and public key become the source of truth and must be reconciled with the
development key and server allowlist.

The server allowlists the matching origin in:

- `.github/workflows/deploy.yml` (production; baked into the image via
  the `EXTENSION_ORIGINS` build-arg)
- `.env.example` / `.env` / `apps/web/.env.local` (local dev)
- `apps/web/src/lib/api/origin-allowlist.test.ts` (regression test)

`pnpm release` re-verifies that the configured development key still derives
to this ID, that the committed allowlist files carry it, and that the final
store ZIP contains no `key` field.

## First-upload checklist (manual, once)

The flow is: create the item in the Chrome Web Store Dashboard, upload the
first keyless ZIP draft, and then reconcile IDs. The Dashboard item ID cannot
be changed afterwards.
After uploading the first draft of a new item, verify all three agree:

1. **Chrome Web Store Item ID**: Dashboard -> Package -> Item ID
2. **manifest key derived ID**: `pnpm release` prints `dev id:` - or
   check locally that the loaded unpacked extension shows the same ID
   on `chrome://extensions`
3. **Server `EXTENSION_ORIGINS`**: the value in `deploy.yml` (and local
   env files)

### If the store item ID differs

The dashboard's ID wins - it cannot be edited. In that order:

1. Copy the store's public key (Dashboard -> Package, or from the published
   CRX) into `manifest.key` in `wxt.config.ts`, so unpacked development builds
   derive the store's ID. `pnpm release` will still remove it from the uploaded
   ZIP.
2. Update `EXTENSION_ORIGINS` to `chrome-extension://<store-id>` in
   `deploy.yml`, `.env.example`, `.env`, `apps/web/.env.local`, and
   `origin-allowlist.test.ts`.
3. Update `EXPECTED_EXTENSION_ID` in
   `apps/extension/scripts/release.mjs`.
4. Re-run `pnpm release` (must pass), `pnpm --filter @transcriptly/web test`,
   and redeploy the web app before publishing the extension: the extension's
   writes fail origin checks until the server accepts the new origin.

## Publishing an update

1. Bump the version in both `package.json` files.
2. Push to `main`: the Deploy workflow runs `pnpm release` (same checks)
   and attaches the ZIP to the `extension-v<version>` GitHub Release
   (same version pushed again recreates the release so the tag and source
   archives follow the newest commit). Download it from the repo's
   Releases page.
3. `pnpm release` locally if you want a pre-push check - must pass.
4. Upload the ZIP in the Dashboard.
5. No ID work needed: the key, allowlists, and store item already agree.
