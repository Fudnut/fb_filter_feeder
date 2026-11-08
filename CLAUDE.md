@AGENTS.md

# Project-specific notes (FluffBlock Purity, "FBP")

- Store name: "FluffBlock Purity" (short name "FluffBlock"). Earlier names:
  "FB Feed Filter", "Feed Bouncer". Keep the Firefox id
  `fluffblock-purity@kalzac.net` unchanged. The older `fb-feed-filter@kalzac.net`
  belongs to the AMO test add-on and cannot be reused. Store submission details are in
  `STORE-SUBMISSION.md`.
- Text the user types (custom word filters) goes in `storage.local`, never
  `storage.sync`. Use `core.loadCustomWordFilters`.

- No build step. Plain content.js/core.js/popup.js/*.html/*.css loaded
  directly by manifest.json. No package.json, no bundler — don't add one.
- Existing conventions to reuse, not reinvent: `data-fffc-*` attributes for
  classification state, `fffc:` prefix on chrome.runtime message types, the
  `counters` object for instrumentation.
- No real unit tests are possible — logic runs against live, unmockable
  Facebook DOM. "Leave one runnable check behind" here means: add/extend a
  `counters.*` field so the diagnostics export (Export diagnostics / Export
  DOM buttons in the popup) can confirm the fix actually fired — not a
  mock-DOM test file.
- Repo: https://github.com/Fudnut/fb_filter_feeder (current; the old
  feed-bouncer repo is stale).

