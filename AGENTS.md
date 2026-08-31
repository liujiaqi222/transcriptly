# transcriptly

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (repo: liujiaqi222/transcriptly), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default triage labels kept as-is (needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` + `docs/adr/`, created lazily by `/domain-modeling`. See `docs/agents/domain.md`.

### YouTube SPA safety

When changing batch discovery, selection lifecycle, or tab capture, preserve source and target identity. See `docs/agents/youtube-spa-safety.md`.

### Live YouTube page fixtures

When a capture incident suggests YouTube changed its page structure, capture the real page and pin it as a regression fixture in `packages/capture/test/fixtures/live/`. See `docs/agents/live-fixtures.md`.

### Extension origin boundary

When adding or changing extension-facing web API routes, or debugging extension reads that silently return nothing while writes succeed, apply the Origin rules: background GETs carry no Origin under host permissions, mutations stay strict. See `docs/agents/extension-origin-boundary.md`.

### Chrome Web Store release

The extension ID is pinned by the manifest key and allowlisted by the server. When publishing, changing the key, or editing EXTENSION_ORIGINS, keep the three in sync and run `pnpm release`. See `docs/agents/chrome-web-store-release.md`.

### Visual design

Use the shared ink, blue-interaction, and yellow-CTA palette plus the 4px spacing rhythm for extension surfaces. See `docs/agents/visual-design.md`.
