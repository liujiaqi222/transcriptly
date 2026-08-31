# Live YouTube page fixtures

YouTube watch pages are an unversioned external contract: the server ships
multiple structural variants at once, and they drift without notice. When a
capture incident looks like a page-structure change, capture the real page
and pin it as a regression fixture.

## Where

`packages/capture/test/fixtures/live/` - named
`watch-variant-<distinguishing-feature>.html`. Existing fixtures cover the
three variants diagnosed in #100:

- `watch-variant-a-json-element.html` - ytInitialData in a
  `<script id="yt-initial-data" type="application/json">` element, no inline
  var script.
- `watch-variant-b-dialog-id-form.html` - the owner's share dialog names the
  channel as `/channel/UC…` (ID form), not `@handle`.
- `watch-variant-c-title-runs-only.html` - no share dialog; identity comes
  from the owner's title runs. `link[itemprop="url"]` points at the video
  itself, so the DOM fallback yields nothing.

## Capture procedure

1. Fetch the real page with a browser User-Agent:

   ```sh
   curl -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" \
     "https://www.youtube.com/watch?v=<videoId>" -o page.html
   ```

2. Inject the fake transcript panel before `</body>` (live server HTML never
   ships the rendered panel; the existing fixtures show the snippet), and
   redact `visitorData` values (device fingerprint) to `REDACTED`.

3. Save as `watch-variant-<feature>.html`, add the video URL to the map in
   `packages/capture/test/live-fixtures.test.ts`, and extend the assertions
   with what the new variant must extract.

## Rules

- The fixtures are large single-line blobs (~1.3 MB each). Keep assertions
  structural (channel identity, schema acceptance), not content-dependent.
- Never edit a saved fixture's structure - the point is that it is the page
  as YouTube shipped it. Redactions (`visitorData`) are the only permitted
  mutation.
- If `live-fixtures.test.ts` fails after YouTube changes something, that is
  the signal: re-fetch, compare against the saved variant, and add the new
  variant rather than patching the old one.
