# FB Purity Feed Filter: store submission pack

Publisher: Steve Rose, beachie41@gmail.com. Package: `FB-Purity-Feed-Filter-0.1.0.19.zip` (same zip for both stores).
Prepared 2026-11-08. Store rules change; confirm each item in the live dashboard.

## 0. Do these first (blockers and decisions)

1. **Privacy policy URL.** Chrome's Privacy tab asks for one. Host the text in section 5 at a public URL
   (for example a GitHub Pages page or a public gist). I cannot host it for you.
2. **Screenshots.** Chrome needs at least 1 (1280x800 or 640x400, up to 5). Firefox accepts screenshots too.
   Take them on your own feed. Blur names, faces and post text of other people.
3. **Firefox minimum version.** `manifest.json` has `strict_min_version "109.0"` plus `data_collection_permissions`.
   Mozilla says that field needs Firefox 140+, and reports say Firefox 127 and older reject it.
   Decide: (a) set `strict_min_version` to `140.0` (Mozilla's advice, smaller audience), or (b) keep 109 and accept
   a possible install warning on old Firefox. I have not changed it.
4. **Name risk.** "FB" and "Facebook" are Meta trademarks. Both stores can remove listings that look affiliated.
   The descriptions below include a "not affiliated with Meta" line. Expect this to be the main review risk.
5. **"Testing build" text.** `popup.html` and `options.html` still show "Testing build <version>". Change it before
   publishing (suggested: just "Version <version>"). Needs a new zip.
6. **Account setup.** Chrome Web Store developer account (one-time registration fee, about 5 USD, 2-step
   verification) with publisher name Steve Rose and contact email beachie41@gmail.com. Firefox: free
   addons.mozilla.org account. The EU trader/non-trader declaration on Chrome is yours to answer.

## 1. Listing text (both stores)

**Name:** FB Purity Feed Filter

**Short description (Chrome summary, max 132 chars; current manifest text is 125):**
Filters Facebook ads, sponsored and suggested posts, Reels, Marketplace posts, Stories, sidebar suggestions and custom words.

**Firefox summary (AMO, keep under 250):**
Hide ads, Sponsored and Suggested posts, Reels, Stories and sidebar suggestions on Facebook, and filter posts by your own words. Runs locally. No data collected.

**Detailed description:**
FB Purity Feed Filter cleans up your Facebook feed. Turn each filter on or off from the toolbar popup:

- Ads and Sponsored posts: in the feed, Marketplace and the right sidebar
- Suggested posts, suggested groups and group chat suggestions
- Reels and the Stories tray
- Posts that contain words you choose (custom word filters)
- Optional activity filters and a home-feed sorting choice (most recent, favorites, friends, groups, pages)

Display modes: hide, collapse, or debug (outline matches so you can see what is filtered). Every filtered post can be revealed with one click.

Privacy: everything runs inside your browser on facebook.com. The extension sends nothing anywhere and has no account, tracking or analytics. Your settings are saved with your browser's extension storage.

Facebook changes its pages often. If something stops being filtered, use "Export diagnostics" in the popup and send the file to the support email.

FB Purity Feed Filter is an independent project. It is not affiliated with, endorsed by or sponsored by Meta Platforms, Inc. or Facebook.

**Category:** Chrome: Productivity (or Social & Communication). Firefox: Social & Communication, plus Privacy & Security.
**Language:** English.
**Support email:** beachie41@gmail.com. **Homepage / support URL:** your GitHub repo or a page you choose (decide).
**License (Firefox):** MIT (the `LICENSE` file in the zip is MIT).

## 2. Chrome Web Store: Privacy tab answers

- **Single purpose:** Remove unwanted content (ads, Sponsored, Suggested posts, Reels, Stories and posts matching the user's words) from the Facebook feed, as the user chooses.
- **Permission justifications:**
  - `storage`: saves the user's filter settings and word list (`chrome.storage.sync`).
  - `activeTab` and `scripting`: when the user opens the popup on a Facebook tab where the filter script is not yet running, the popup injects the extension's own `content.js`, `core.js` and `content.css` into that tab. Also used by Reapply, Reveal all and Export diagnostics. Only files packaged in the extension are injected.
  - Host permissions `https://facebook.com/*` and `https://*.facebook.com/*`: the content script reads the page to find and hide matching posts. It runs only on Facebook.
- **Remote code:** No, I am not using remote code. (No fetch, XHR, eval or remote scripts; I checked `core.js`, `content.js`, `popup.js` and `options.js`.)
- **Data usage disclosures:** Tick no data types as collected. Nothing is transmitted or stored off the device. The extension reads page content locally to classify posts. If the dashboard's wording treats local-only page reading as "website content", read its definition and answer accordingly. Certify the three limited-use statements (no selling, no unrelated use, no creditworthiness use).
- **Privacy policy URL:** (the URL you host, section 5).
- **Test instructions for reviewers:** The extension only acts on facebook.com and needs a logged-in Facebook account to see any effect. Suggest: open facebook.com, click the toolbar icon, set display mode to "Debug (outline)"; Sponsored posts then get a red outline and label. No credentials are provided because none can be shared.

## 3. Firefox (AMO): fields and notes

- **Distribution:** "On this site" (listed on AMO).
- **Source code upload:** No. The code is plain, unminified JavaScript and the zip is the source. No build step.
- **Experimental:** No. **Paid or non-free services:** No.
- **Add-on ID:** `fb-feed-filter@kalzac.net` (kept, as you decided). The manifest declares `data_collection_permissions: required: ["none"]`.
- **Privacy policy:** Required only if data leaves the device. None does. You may still paste section 5.
- **Notes for reviewers:** "Plain JavaScript, no build, no minification, no remote code, no network requests. Only acts on facebook.com and needs a Facebook login to see an effect. To see it work: open facebook.com, click the toolbar icon, choose Debug mode; Sponsored posts get a red outline. Permissions: storage (settings), activeTab and scripting (popup injects the packaged content script), host access to facebook.com (content script)."
- **Review risk:** MV3 host permissions are user-grantable in Firefox. Users may need to allow facebook.com in the extension's permissions if the filter seems inactive. Mention this in the description if you want fewer support emails.

## 4. Assets checklist

| Asset | Chrome | Firefox | Status |
|---|---|---|---|
| Extension icons 16/48/128 PNG in zip | 128 required | 48/96+ used | In zip |
| Screenshots | 1+ at 1280x800 or 640x400 (max 5) | optional, any size | Steve to make |
| Small promo tile 440x280 | optional (listed higher if present) | n/a | Optional |
| Marquee 1400x560 | optional | n/a | Optional |
| Privacy policy URL | yes | only if data sent | Steve to host |
| Zip | `FB-Purity-Feed-Filter-0.1.0.19.zip` | same | Built; rebuild after item 0.5 |

## 5. Privacy policy (host this text)

**FB Purity Feed Filter: Privacy Policy** (last updated 2026-11-08)

FB Purity Feed Filter ("the extension") is published by Steve Rose (beachie41@gmail.com).

**What the extension does with data.** The extension runs only on facebook.com. It reads the web page in your browser to decide which posts to hide or outline. This happens entirely on your device. The extension does not send page content, your Facebook activity, your identity or any other data to the publisher or to any third party. It has no accounts, analytics, advertising or tracking.

**What is stored.** Your settings (which filters are on, display mode, your custom word list, home-feed choice) are saved with your browser's extension storage. If you use browser sync, your browser may sync these settings to your own browser account under the browser vendor's terms. The publisher cannot see them.

**Diagnostics.** The "Export diagnostics" and "Export DOM" buttons create a file on your device only when you click them. The file is not sent anywhere unless you choose to send it, for example by email to the support address. A DOM export can contain text visible on your Facebook page; review it before sharing.

**Third parties.** None. The extension is not affiliated with Meta Platforms, Inc.

**Changes and contact.** If this policy changes, the date above will change. Questions: beachie41@gmail.com.

## 6. Submission steps

**Chrome:** developer dashboard > Add new item > upload the zip > fill Store listing (section 1, assets) > Privacy tab (section 2) > Distribution (public, all regions) > Submit for review.
**Firefox:** addons.mozilla.org > Developer Hub > Submit a New Add-on > "On this site" > upload zip (validator runs) > source code: No > fill listing (sections 1 and 3) > Submit.
Review takes from hours to several days. A first listing with "Facebook" in or near the name often draws a manual review.
