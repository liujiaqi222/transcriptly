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
