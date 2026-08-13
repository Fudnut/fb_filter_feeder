@AGENTS.md

# Project-specific notes (Feed Bouncer)

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
- Repo: https://github.com/Fudnut/feed-bouncer (private).
