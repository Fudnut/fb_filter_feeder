# Changelog

All notable changes to FB Feed Filter are listed here. Starting at 0.1.0.2,
the manifest `version` build number is bumped on every change, and the
distributed zip is named to match, so a filename always tells you exactly
which build it is. Everything before that shipped under 0.1.0.1, so those
entries are grouped together and dated instead.

## 0.1.0.18 - 2026-11-04
- Add an opt-in "Home feed sorting" setting (top of the options page
  Filters tab, and the userscript panel). Choices: Facebook default (off),
  Most recent (chronological), Favorites, Friends,
  Groups, Pages. When set, the bare home URL redirects to
  `/?filter=<choice>&sk=h_chr`. URLs verified on live Facebook 2026-11-04.
- Only the bare home URL is redirected. A URL that already has `sk` or
  `filter` is left alone, so a Feeds tab you pick yourself is respected.
- A 5 s loop guard (`sessionStorage` key `fffc:homeFeedRedirectAt`) stops
  repeated redirects.
- Clicking Home or the logo inside the site can take up to about 2 s to
  redirect, because it relies on the existing 2 s route-change interval.
- Diagnostics now report `homeFeed.lastRedirect` (time and choice of the
  last redirect, or null) to confirm the redirect fired on the landed page.
- Fixed a false "[feed-bouncer] ... none from literal disclosure text"
  warning that showed on the browser's extension Errors page in nearly
  every session since the breakage detector was added. It compared
  disclosure-text matches against `uniqueMatches`, which also counts
  Suggested posts, Reels, the Stories tray, right-rail modules and
  Marketplace matches - none of which ever carry disclosure text. It now
  compares against ad/Sponsored matches only (`adMatches` +
  `sponsoredMatches`), so it fires only when ads are found and none of
  them by their label text. The diagnostics `textDisclosureDetectionSuspect`
  field uses the same check.

## 0.1.0.17 - 2026-10-03
- Detect the "Ads" carousel on Marketplace item pages from its heading and
  adjacent ad cards. Mark only that section, so the listing details remain
  visible. The Sponsored toggle controls it in hide and collapse modes;
  debug mode outlines it. Diagnostics now report `marketplaceAds` and
  `marketplaceAdsModules` to confirm detection on a live page.
- Make the existing right-sidebar Sponsored section honor the Sponsored
  toggle when hide or collapse mode is selected.

## 0.1.0.16 - 2026-08-20
- Reverted the 0.1.0.15 embedded-post CTA guard (`ctaButtonBelongsToEmbeddedPost`).
  Reported symptom: in collapse mode, clicking "Show" on a collapsed
  Sponsored post made it disappear (height collapsed to 0) instead of
  expanding - Suggested posts were unaffected. Reported on Vivaldi;
  investigated live via Claude in Chrome against the developer's own
  Chrome/Facebook session once that access was set up.
  `ctaButtonEmbeddedPostProtections` reading 0 in every diagnostics export
  ruled out the guard as the direct cause of the reveal symptom itself, but
  live DOM testing against a real, ordinary post ("Everything Garage Doors
  and Sheds") found the guard firing (`true`) on a completely different,
  already-handled shape it was never designed for: a Page post shown
  inside a Group, where Facebook stamps a `profile_name` on the
  group-name breadcrumb *and* on the actual author - two `profile_name`
  elements with no reshare involved at all. That's exactly what the
  existing `hasGroupOrigin` guard (0.1.0.12) already catches; the new
  guard couldn't distinguish the two shapes and suppressed a real ad's CTA
  match, which - given a story with prior classification state - can
  strip `data-fffc-revealed` via `clearMatch()` on a subsequent
  reclassification, matching the reported symptom's shape even though the
  exact trigger differs from Rob's original session (his
  `ctaButtonEmbeddedPostProtections` also read 0, meaning whatever tripped
  the guard for him took a different path than this one). The reshare
  false positive 0.1.0.15 fixed (Suzanne Dousset resharing a "True Crime
  Society" Page post) is real but narrower than the false positives the
  guard introduced, so it's reverted rather than patched again without a
  live capture of the specific failure to fix it against. CTA-button
  detection is back to exactly its 0.1.0.14 shape: `ctaButtonAdSignal` +
  `hasGroupOrigin` only.

## 0.1.0.15 - 2026-08-20
- Fixed a false-positive Sponsored classification on reshares: the
  CTA-button-marker signal (`ctaButtonAdSignal`) queries the whole story
  for any `[data-ad-rendering-role^='cta']` element, with no scoping to
  which post within the story it belongs to. A reshare/quote-share renders
  the sharer's own header/message immediately followed by the shared
  post's own header/message, both through the same component family the
  CTA check keys off - so a CTA on the *embedded* post (a Page's own "Send
  message"/"Shop now" button) was getting attributed to the sharer's own
  post instead (live capture 2026-08-20: Suzanne Dousset resharing a "True
  Crime Society" Page post, collapsed as "Sponsored · 100%"). New
  `ctaButtonBelongsToEmbeddedPost()` guard detects a second
  `data-ad-rendering-role='profile_name'` inside the story (the signature
  of a nested sub-post) and checks containment - not DOM order, which
  turned out not to be reliable here since the profile_name attribute
  lands on a wrapper that closes later in the tree than the CTA itself,
  even though the CTA is clearly nested inside that same wrapper - to tell
  whether the CTA sits inside the embedded post's own boundary rather than
  the story's own. New `ctaButtonEmbeddedPostProtections` counter confirms
  it fires. Same shape as the existing `hasGroupOrigin` guard from
  0.1.0.12, just for a different embedding mechanism (a quote-share
  instead of a group relay) - a real in-group or in-quote ad still falls
  through to the text-disclosure detectors, which Meta's policy requires
  every paid placement to render regardless.

## 0.1.0.14 - 2026-08-17
- Bumped from 0.1.0.13, which hit a Mozilla add-on review snag after the
  listing was deleted and recreated; re-using that version number wasn't
  possible.
- Fixed a visible flash on every sponsored/suggested post while scrolling
  on Firefox: a post would render, then disappear a moment later, rather
  than never appearing at all. Root cause: `refreshViewportStories()` only
  ever queues a story for classification once it already intersects the
  viewport at 0px margin, and the reactive intersection observer backing
  it only acted on stories already in that frozen set - so a freshly
  streamed-in post always got at least one paint, often several, before
  detection ever ran. `INTERSECTION_PRESCAN_MARGIN` (800px) now lets a
  story be classified and hidden while it's still below the fold, so the
  hide lands before the post is ever painted. Kept well inside the
  existing `FILTER_LAYOUT_QUIET_MS` guard - a story pulled into the
  observer's range because a hide we just applied shifted the layout is
  skipped for the same reason a genuine scroll event is skipped in that
  window, so this doesn't reopen the hide-cascade risk that guard exists
  for. New `prescanIntersections`/`prescanQuietWindowSkips` counters
  confirm both paths fire. Unverified against live Facebook - awaiting
  re-test.
- Amended before first deploy (still 0.1.0.14, no version bump): the
  IntersectionObserver margin above wasn't enough on its own - live testing
  on Chrome still showed a brief flash. `queueStory()` only ever queues a
  story once it's already a member of `viewportStoryCohort`, and a story
  freshly discovered by the mutation observer only becomes a member once
  the IntersectionObserver's own, separately timed callback admits it -
  which is a real round trip, not a same-tick event, so the story still
  sat unclassified for however many frames that took. Mutation-triggered
  discovery carries no hide-cascade risk to begin with (a mutation only
  fires for a node that actually changed, never merely because a sibling's
  hide shifted the layout), so `queueStory()` now checks the pre-scan
  margin synchronously via `getBoundingClientRect()` for mutation-sourced
  calls and admits a story into the cohort immediately when it already
  qualifies, rather than waiting on the observer round trip at all. New
  `mutationPrescanAdmissions` counter confirms it fires. Unverified against
  live Facebook - awaiting re-test.

## 0.1.0.13 - 2026-08-17
- First real deploy of everything accumulated below under 0.1.0.12's
  "amended before first deploy" entries - the Mac Chrome geometry-fallback
  discovery path, the hide-mode collapse fix, the `<html>` root attribute
  capture, the first-reconciliation-pass skip, the ephemeral disclosure-
  label cache, and the self-diagnosing breakage detector. Bumped now rather
  than kept at 0.1.0.12 because that build accumulated five rounds of
  amendments across several days of live Mac Chrome testing with Rob, and
  the build number had stopped being a reliable way to tell which of those
  amendments a given diagnostics export or DOM capture actually reflects.

## 0.1.0.12 - 2026-08-13
- Amended before first deploy (still 0.1.0.12, no version bump): `storyCandidates()`
  now falls back to the geometry-only capture (large, visible, text-bearing
  blocks directly under `<main>`, added in 0.1.0.11 for Export DOM) when the
  normal `aria-posinset`/`role='article'` discovery finds nothing substantial.
  A Mac Chrome tester's DOM capture (2026-08-14) confirmed real feed posts
  rendering with neither attribute at all - sidebar and Marketplace filtering
  kept working (separate selectors) but the whole News Feed pipeline went
  dark, since the fallback had only ever been wired into the diagnostic
  capture, not real story discovery.
- Amended before first deploy (still 0.1.0.12, no version bump): the geometry
  fallback above shipped a regression of its own - a second Mac Chrome
  tester ("Rob", 2026-08-15) reported the feed working in debug mode (which
  never hides anything) but going completely blank in hide mode. Their DOM
  capture showed both real posts found that session came from the geometry
  fallback, one correctly flagged Sponsored. Hypothesis: a geometry-picked
  div is a plain size/text/visibility match, not a confirmed post boundary -
  it could be Facebook's own virtualized-list item wrapper, and hide mode's
  `display:none` fully removes a matched element from layout, which can
  desync whatever Facebook itself measures on that wrapper for scroll/
  render. Fallback-discovered stories now carry `data-fffc-geometry-fallback`
  and content.css routes them through the same layout-preserving collapse
  treatment collapse mode already uses (a small labelled bar, box stays in
  the flow) even when the user's mode is "hide" - collapse mode itself
  needed no change, its rules already match on kind alone regardless of
  discovery method. New `geometryFallbackCandidatesSeen` diagnostic counter
  tracks how often the fallback fires. Unverified against live Facebook -
  awaiting re-test.
- Amended before first deploy (still 0.1.0.12, no version bump): the collapse
  fix above didn't resolve Rob's blank-feed report - a follow-up capture
  confirmed `data-fffc-geometry-fallback` was present and classification
  was firing correctly, but every capture taken so far has been in debug
  mode, which never hides anything - we still have zero data on what hide
  mode's DOM actually looks like while it's failing. `captureDomSnapshot()`
  now records `document.documentElement`'s `data-fffc-*` attributes in the
  capture header (content.css's hide/collapse rules key off these; nothing
  previously verified they're set correctly at capture time). The Export
  DOM button already works in any display mode - not debug-gated as
  assumed - so a real hide-mode capture is possible without switching modes
  first.
- Amended before first deploy (still 0.1.0.12, no version bump): a real
  hide-mode capture from Rob (2026-08-17) plus his own description - one
  "Sponsored" bar on load, "have to click show to be able to see the feed",
  then correct per-post collapsing while scrolling - located the actual bug.
  The root `<html>` attributes (added above) confirmed `data-fffc-mode`
  etc. were all correct, ruling that theory out. Root cause: the very first
  reconciliation pass runs immediately at page load, before Facebook has
  hydrated the feed into individually-sized posts. At that moment
  `fallbackVisibleContentBlocks()` can pick up one large "everything loaded
  so far" wrapper as if it were a single post, and the CTA-button-marker
  signal - which queries broadly within whatever boundary it's given -
  matches on one ad anywhere in that early batch and collapses the entire
  wrapper, hiding the whole feed until manually revealed. `storyCandidates()`
  now skips the geometry fallback on reconciliation pass 1 only; real
  per-post detection or the 100ms startup rescan (`STARTUP_RESCAN_DELAYS`)
  catches up almost immediately after. Considered rejecting candidates with
  more than one `profile_name` marker instead, but real single posts can
  legitimately have two (an embedded shared post) or many `cta-N` markers
  (a product carousel, seen in an earlier capture) - skipping the one
  known-unstable pass is smaller and doesn't add a new heuristic. New
  `geometryFallbackSkippedFirstPass` counter confirms the guard fires.
  Unverified against live Facebook - awaiting re-test.
- Amended before first deploy (still 0.1.0.12, no version bump): two
  additions. (1) Ephemeral disclosure-label caching: Facebook parks an ad's
  accessible-name target - a portal `<span id="_r_…">` or an SVG `<symbol>`
  a sprite `<use>` points at - outside the post, then sometimes removes it
  again within the same frame once the accessible name is computed. The
  existing `labelledReferenceLabel`/`referencedSvgLabel` detectors
  (`svgLabelMatches`, `labelledReferenceMatches`) sat at 0 across every Mac
  Chrome capture this week despite classification succeeding via the
  CTA-button fallback - `document.getElementById(id)` was finding nothing
  because the target was already gone by the time the deferred scan ran. A
  bounded `ephemeralLabelText` cache (200 entries, oldest-evicted) now
  records id -> text synchronously in the MutationObserver callback, before
  the node can be removed, and both detectors fall back to it when the live
  lookup misses. New `svgLabelCacheHits`/`labelledReferenceCacheMatches`
  counters confirm it fires. (2) Self-diagnosing breakage detection: the six
  literal-disclosure-text detectors are the reliable signal; the CTA-button-
  marker and similar heuristics are proxies for it and can false-positive.
  If matches keep being found every session but none of them ever come from
  literal disclosure text despite scanning hundreds of header candidates,
  that's the same signature a structural Facebook markup change leaves
  behind - exactly what every Mac Chrome capture this week showed. A
  one-time `console.warn` plus a live `textDisclosureDetectionSuspect` field
  in Export Diagnostics now surfaces that state directly, instead of
  needing another multi-round DOM-capture investigation to notice it.
- Fixed a false-positive Sponsored classification: `[data-ad-rendering-role^='cta']`
  (the CTA-button-marker signal, `ctaButtonAdSignal`) isn't ad-exclusive after
  all - a followed Page's own post (Send Message CTA, no visible Sponsored
  disclosure anywhere) rendered through the same component family when
  relayed into the main feed from a joined group (live report 2026-08-13:
  "J&F Pressure Cleaning" post). The signal now reuses the existing
  `hasGroupOrigin` guard - already used to protect the Suggested classifier
  from Follow-in-group false positives - so a group-originated post no
  longer trips the CTA marker alone; a real in-group ad still falls through
  to the text-disclosure detectors Meta's policy requires it to render.
  New `ctaButtonGroupOriginProtections` diagnostic counter confirms when the
  guard fires.

## 0.1.0.11 - 2026-08-12
- Amended before first deploy (still 0.1.0.11, no version bump): Export
  DOM now falls back to a geometry-only capture (large, visible,
  text-bearing blocks directly under `<main>` - no Facebook-specific
  attribute names at all) whenever the normal `storyCandidates()` capture
  finds nothing with real text content. Prompted by a Mac Chrome tester
  whose main feed rendered posts fine on screen while `storyCandidates()`
  found nothing but stray loading skeletons all session - manual "Copy
  Outer HTML" was the only way to see what was actually there, which
  defeats the point of an automated capture for non-technical testers.
  Deliberately geometry-based rather than a third named selector: a new
  selector is just another specific guess that breaks again the next
  time Facebook's markup shifts, where size + viewport visibility + text
  content survives any future structural change. Same fallback also
  covers the unrelated case (seen repeatedly this session already) where
  every captured story happens to be virtualized/empty at the capture
  instant - one mechanism for both, not a single-case patch. Costs
  nothing when normal detection is working, which is the common case.
  The popup's save confirmation now flags when the fallback was used, as
  a signal worth reporting.
- Amended before first deploy (still 0.1.0.11, no version bump): split
  the Options page into 3 tabs (native `hidden`-attribute panels, no new
  dependency) - each new filter had made it one long scroll. Filters
  (Custom word filters, Activity post filters, AI content label) /
  Suggested & Marketplace (Suggested post subcategories, Marketplace
  default listing age) / Account (Deleted Friends alerts).
- Added a Marketplace "default listing age" feature (Options > Marketplace
  default listing age): Off / Last 24 hours / Last 7 days / Last 30 days.
  Facebook Marketplace only sorts by newest listings when the "Date
  listed" filter is picked manually, every visit, with no way to make it
  the default. Confirmed via three captured URLs that Facebook encodes
  that filter directly as `?daysSinceListed=1/7/30` on category/search
  result pages, so this forces it by redirecting to the same URL with
  that parameter already applied rather than simulating a click on
  Facebook's own filter dropdown - no Marketplace DOM dependency at all.
  Hooked into the same route-change detection (poll + popstate) the
  reconciliation loop already uses for Facebook's SPA navigation, so it
  reapplies when switching Marketplace categories, not just on first
  load. Untested on the plain Marketplace browse root (no category/
  search context) - if Facebook ignores the parameter there, it's a
  harmless no-op on that page, not a broken redirect.
- Amended before first deploy (still 0.1.0.11, no version bump): also
  flips `exact=false` to `exact=true` on the same redirect, when
  Facebook's own URL already sets it false. `exact` is almost certainly
  a search-strictness toggle rather than a date-accuracy setting, but
  user testing found the date filter reads as more accurate with it
  forced true - plausibly because `exact=false` lets Facebook pad
  results with algorithmically-related listings that don't strictly
  honor the date filter. Never manufactures the param on pages that
  don't already have it.
- Amended before first deploy (still 0.1.0.11, no version bump): fixed
  Export DOM throwing a browser-level console error on nearly every
  capture ("<path> attribute d: Expected number, ..."), reported from
  the Extensions page for the last several versions. `sanitizeCloneForCapture`
  truncated every attribute over 300 chars, including SVG `d`/`points`
  geometry data - icon SVGs routinely exceed that, and slicing path data
  mid-value then appending "...[truncated, N chars total]" text makes it
  invalid syntax, which the browser parses eagerly (even on a detached,
  unrendered clone) and throws on. `d` and `points` are now left at full
  length instead of truncated - they aren't the tracking-URL bloat the
  truncation exists for.
- Amended before first deploy (still 0.1.0.11, no version bump): fixed
  the Marketplace date filter fighting a manual "All" selection.
  Confirmed via captured URLs that Facebook represents "All" the same
  way as "never touched" - `daysSinceListed` simply absent either way -
  so the extension couldn't tell them apart and kept re-forcing the
  default the moment the user cleared it. Now tracks the category/search
  context (URL minus `daysSinceListed`/`exact`) in `sessionStorage` and
  only forces the default when that context actually changes (a genuine
  new category), not merely when the parameter is absent within a
  context already visited this session. `exact=false` still gets
  corrected even when the date filter itself is being left alone.

## 0.1.0.10 - 2026-08-12
- Raised the Export DOM caps again, this time as a deliberate safety
  ceiling rather than a size tuned to what's been observed: 200,000
  chars/story and 800,000 chars total (0.1.0.9) still risked truncating
  a real post if a bigger one showed up, which is exactly the bug that
  prompted this in the first place. Per-story is now 2,000,000 chars and
  total is 20,000,000 chars (~15x the largest post seen so far) - meant
  to never be hit by a real post, only to stop a pathological one from
  producing a capture too large for chrome.tabs.sendMessage or the
  download to handle. `CAPTURE_MAX_STORIES` (40) is unchanged - the
  story-count cap was never what caused the Stax Burger miss.

## 0.1.0.9 - 2026-08-12
- Fixed Export DOM silently dropping the post being debugged: a real
  capture showed in-viewport posts running 96,574-124,283 chars
  uncapped, while `CAPTURE_MAX_HTML_PER_STORY` was 20,000 - every real
  (non-virtualized) story in that capture got truncated before reaching
  its own header/caption text, so grepping the export for the post's
  name found nothing even though the post was on screen when captured.
  Raised the per-story cap to 200,000 chars and the total cap to
  800,000 chars, with headroom above the largest post seen so far.

## 0.1.0.8 - 2026-08-04
- Replaced the 0.1.0.7 "Export page snapshot" (whole-page outerHTML, several
  MB, untested at real size) with a scoped, size-capped "Export DOM"
  capture, ported from an implementation you brought over from a separate
  Claude session built on top of this exact codebase. Captures only the
  story elements the classifier currently sees plus the right rail (via
  the existing `storyCandidates()`), strips `<script>/<style>/<noscript>/
  <template>`, truncates any attribute over 300 chars (fixes the giant
  `__cft__`/`__tn__` tracking-URL bloat seen in earlier DOM captures this
  session), and replaces `data:` URIs with a placeholder instead of
  embedding them. Hard caps: 40 stories, 20,000 chars per story, 400,000
  chars total (~400KB) - actually small enough to paste or attach,
  unlike the old approach. Each captured story is also labeled with its
  position, viewport visibility and current `data-fffc-*` classification
  state, which the old raw dump didn't include.
  Not ported: the source implementation also added a floating "Export DOM
  capture" button injected directly onto the Facebook page itself (visible
  whenever Debug mode is on). Left that out as extra on-page UI surface
  beyond what was asked - the popup button covers the same capability.

## 0.1.0.7 - 2026-08-04
- Added a one-click "Export page snapshot" button in the popup's Testing
  actions, next to Export diagnostics. Testers were being asked to
  manually run DevTools console commands (`allow pasting` +
  `copy(document.documentElement.innerHTML)`) to send us a DOM capture
  for debugging, which is too technical to ask of most testers. The new
  button sends a `fffc:get-dom-snapshot` message to the content script,
  which returns `document.documentElement.outerHTML`, and downloads it
  as an `.html` file the same way Export diagnostics already downloads
  its `.json` file.
  Deliberately kept as a separate button and a separate warning note
  from Export diagnostics rather than folded into it: diagnostics are
  sanitized (counts and detector codes only), the page snapshot is the
  opposite - several MB of everything currently visible on the page,
  including names, photos and post text. The popup copy makes that
  distinction explicit so it's not exported by habit.
  Not yet tested end-to-end for message-size limits on a real multi-MB
  Facebook page - chrome.tabs.sendMessage doesn't have a documented hard
  cap at this size, but verify a real export succeeds before relying on
  it for tester support.

## 0.1.0.6 - 2026-08-04
- Fixed a tester-reported false positive: a friend's Birthday notice in the
  right sidebar was being labeled "Sponsored · Right sidebar" and hidden.
  The right-rail Sponsored classifier climbs up from a "Sponsored" heading
  to find that module's container, and already refuses to climb past a
  "Contacts" or "Group chats" heading so a nearby Sponsored module can't
  swallow those too - added "Birthdays" to that same protected-heading
  list. Lower risk than the Follow-guard fixes above: this only prevents
  over-climbing, it can't introduce a new false positive. Based on
  Facebook's long-standing "Birthdays" sidebar module heading rather than
  an inspected DOM sample - flagging in case the exact wording has since
  changed.

## 0.1.0.5 - 2026-08-04
- Fixed a third false-positive source in the friend-share Follow guard:
  Facebook's own "{Name} is in {Location}." / "is at {Place}." check-in
  tag renders as a separate link between the actor's name and the Follow
  button, which was being misread as a second, different actor (live
  capture: "Australia/NZ Crime TV is in Russell Island, QLD" suppressed
  a plain Page post's Follow). Added `CHECKIN_CONNECTOR_PHRASES`
  (currently `"is in"`, `"is at"`) - a small list of connector phrases
  checked immediately before a candidate link, so newly-spotted variants
  (e.g. "is with", "checked in at") are a one-line addition instead of a
  new detector.

## 0.1.0.4 - 2026-08-04
- Rebuilt the friend-share Follow guard removed in 0.1.0.3, this time
  grounded in a real DOM capture instead of a screenshot. The capture
  showed why the old href-based comparison failed: Facebook wraps the
  same actor's avatar and name in two separate links with unrelated
  hrefs (avatar → `/stories/...` deep-link, name → `/PageName` profile),
  so href equality is not a valid "same actor" test. Replaced it with a
  name-text comparison: the avatar's `aria-label` is `"{Name}, view
  story"`; stripping that known suffix and comparing to the name link's
  visible text correctly identifies the avatar and name links as the
  same actor, while still catching a genuinely different embedded
  creator. Still needs your Debug-mode verification on both the
  standalone-Follow case and a friend-share case before trusting it.

## 0.1.0.3 - 2026-08-04
- Reverted the friend-share foreign-actor guard added in 0.1.0.1
  (hasForeignActorBeforeAction). Live testing on Firefox/Ubuntu showed it
  suppressing far more legitimate standalone "Suggested · Follow" posts
  (e.g. plain Page posts like "Jehovah's Friends · Follow") than the one
  friend-share false positive it was built to fix -
  `foreignActorProtections` fired 197-257 times per session against only
  61-79 correct `suggestionHeaderActionMatches`. The href-based identity
  comparison it used was very likely tripped by Facebook rendering
  separate avatar-link and name-link elements with different hrefs for the
  same actor. Rather than guess at a third unverified fix, removed the
  guard entirely: Follow/Join detection is back to pre-0.1.0.1 behavior,
  and the rarer friend-share false positive is a known, accepted
  trade-off until it can be fixed against real inspected DOM instead of
  screenshots.

## 0.1.0.2 - 2026-08-03
- Started per-change build-number bumps (this entry). Manifest `version`
  and the zip filename now advance together on every change.
- Renamed the popup's Options button from "Activity filters, word list and
  Deleted Friends status…" to "Optional Filters".
- Added a Close button to the Options page header, since it opens in its
  own tab with no other way to dismiss it short of closing the tab.

## 0.1.0.1 - 2026-08-03
- Added an opt-in "AI content" filter matching Meta's own "AI info"/"AI
  content" disclosure label. Off by default under Options > AI content
  label; verify in Debug mode before enabling, since it hasn't been tested
  against a live Facebook capture. Deliberately not folded into custom word
  filters - that feature only scans link text and specific story/title
  fields, not the plain byline span this label renders in.
- Fixed a regression from the previous fix: the friend-share Follow guard
  had been applied to Join actions too, which could silently stop
  legitimate Suggested Group "Join" posts from being classified. Narrowed
  the guard back to Follow only, matching the existing hasGroupOrigin
  design rule that Join is unambiguous suggestion evidence on its own.
  Also added `foreignActorProtections` to the exported diagnostics so this
  class of issue is visible next time.
- Fixed a false positive where a friend's share of another creator's post
  or reel was classified as Suggested · Follow/Join because the embedded
  original creator's own Follow/Join button sat inside the friend's story.
  The header-action detector now checks whether that button belongs to a
  different actor than the story's own author and skips classification
  when it does.
- Added per-subcategory Suggested post filters (Follow, Join, People You May
  Know, Suggested/Recommended For You, Suggested Groups, Other) under
  Options, so each kind of Suggested content can be enabled or disabled
  independently of the main "Filter Suggested posts" toggle.

## 0.1.0.1 - 2026-08-02
- Collapse and Debug mode labels for Suggested posts now include the
  suggested entity's name (e.g. `Suggested · Follow · 'Page Name' · 95%`)
  alongside the action and confidence.

## 0.1.0.1 - 2026-08-01
- Extension ID changed to `fb-feed-filter@kalzac.net` after AMO rejected
  resubmission under the deleted `feed-filter@kalzac.net` ID (Mozilla does
  not release deleted add-on IDs for reuse).

## 0.1.0.1 - 2026-07-31
- Renamed the extension to "FB Feed Filter" (`name` and `short_name` in
  manifest.json).
