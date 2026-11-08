# FluffBlock Purity: store submission pack

Publisher: Steve Rose, beachie41@gmail.com. Package: `FluffBlock-Purity-0.1.0.20.zip` (same zip for both stores).
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
4. **Name risk.** The new name "FluffBlock Purity" no longer contains "FB" or "Facebook", which lowers trademark risk.
   The description still says "Facebook" to describe what it does, plus a "not affiliated with Meta" line. Check the name
   is free in both stores (search each) before submitting. "FBP" is only a short label; it is not used in the manifest.
5. **"Testing build" text.** Done: now "Version <number>".
6. **Account setup.** Chrome Web Store developer account (one-time registration fee, about 5 USD, 2-step
   verification) with publisher name Steve Rose and contact email beachie41@gmail.com. Firefox: free
   addons.mozilla.org account. The EU trader/non-trader declaration on Chrome is yours to answer.

## 0b. Review notes (Astra / Qwen draft, 24 Aug 2026, checked 2026-11-08)

Astra's conversation (`Qwen.txt`) agreed with this pack and added: move word filters to local storage (done in 0.1.0.20), declare "website content" as handled in Chrome (done above), include a Limited Use statement in the policy (done), keep competitor names out of the listing (none used), and prepare screenshots of the real UI. Decided 2026-11-08: licence is MPL 2.0 (LICENSE replaced); 32 and 64 px icons added to the manifest (Mozilla's recommendation). Letters in the icon: kept, since other store listings use lettering. Astra left the disabled "Deleted Friends" and unverified AI-content filters out of the public description; the description below does the same. Not adopted: a separate public website; a GitHub Pages page is enough.

## 1. Listing text (both stores)

**Name:** FluffBlock Purity

**Short description (Chrome summary, max 132 chars; current manifest text is 125):**
Filters Facebook ads, sponsored and suggested posts, Reels, Marketplace posts, Stories, sidebar suggestions and custom words.

**Firefox summary (AMO, keep under 250):**
Hide ads, Sponsored and Suggested posts, Reels, Stories and sidebar suggestions on Facebook, and filter posts by your own words. Runs locally. No data collected.

**Detailed description:**
FluffBlock Purity cleans up your Facebook feed. Turn each filter on or off from the toolbar popup:

- Ads and Sponsored posts: in the feed, Marketplace and the right sidebar
- Suggested posts, suggested groups and group chat suggestions
- Reels and the Stories tray
- Posts that contain words you choose (custom word filters)
- Optional activity filters and a home-feed sorting choice (most recent, favorites, friends, groups, pages)

Display modes: hide, collapse, or debug (outline matches so you can see what is filtered). Every filtered post can be revealed with one click.

Privacy: everything runs inside your browser on facebook.com. The extension sends nothing anywhere and has no account, tracking or analytics. Your settings are saved with your browser's extension storage.

Facebook changes its pages often. If something stops being filtered, use "Export diagnostics" in the popup and send the file to the support email.

FluffBlock Purity is an independent project. It is not affiliated with, endorsed by or sponsored by Meta Platforms, Inc. or Facebook.

**Category:** Chrome: Productivity (or Social & Communication). Firefox: Social & Communication, plus Privacy & Security.
**Language:** English.
**Support email:** beachie41@gmail.com. **Homepage / support URL:** your GitHub repo or a page you choose (decide).
**License (Firefox):** Mozilla Public License 2.0 (the `LICENSE` file in the zip is MPL 2.0).

## 2. Chrome Web Store: Privacy tab answers

- **Single purpose:** Remove unwanted content (ads, Sponsored, Suggested posts, Reels, Stories and posts matching the user's words) from the Facebook feed, as the user chooses.
- **Permission justifications:**
  - `storage`: saves the user's filter settings. Ordinary on/off preferences use browser sync storage. Custom word-filter terms (text the user types) are kept in local storage only and are never synced.
  - `activeTab` and `scripting`: when the user opens the popup on a Facebook tab where the filter script is not yet running, the popup injects the extension's own `content.js`, `core.js` and `content.css` into that tab. Also used by Reapply, Reveal all and Export diagnostics. Only files packaged in the extension are injected.
  - Host permissions `https://facebook.com/*` and `https://*.facebook.com/*`: the content script reads the page to find and hide matching posts. It runs only on Facebook.
- **Remote code:** No, I am not using remote code. (No fetch, XHR, eval or remote scripts; I checked `core.js`, `content.js`, `popup.js` and `options.js`.)
- **Data usage disclosures:** Declare that the extension handles **Website content**: it reads visible Facebook page text, links and labels to classify posts. Handled locally: yes. Transmitted to the developer or anyone else: no. Sold or shared for advertising: no. Analytics or tracking: no. Do not claim "no user data" just because nothing is uploaded; Chrome counts local processing of page content. Certify the three limited-use statements. (This replaces my earlier "tick nothing" advice, after the Astra review below.)
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
| Zip | `FluffBlock-Purity-0.1.0.20.zip` | same | Built (0.1.0.20) |

## 5. Privacy policy (host this text)

**FluffBlock Purity: Privacy Policy** (last updated 2026-11-08)

FluffBlock Purity ("the extension") is published by Steve Rose (beachie41@gmail.com). It filters selected content while you browse Facebook.

**Information processed.** To filter, the extension examines content rendered on facebook.com pages inside your browser: visible page text, links, labels and page structure. This processing happens locally in your browser.

**Information sent to the developer.** None. The extension does not transmit Facebook page content, posts, messages, names, account identifiers, cookies, authentication information or browsing history to the developer or anyone else. It has no analytics, advertising or tracking service.

**Settings.** Ordinary on/off preferences use browser-provided synchronized storage, so your browser provider may sync them between your devices if you use browser sync. Custom word and phrase filters you type are stored locally in your browser and are not synced or transmitted by the extension.

**Diagnostics.** "Export diagnostics" saves a file of detector information and counts to your device when you click it. "Export DOM" saves a troubleshooting file that can contain visible page text, author names and links. Neither file is uploaded automatically. Review the DOM file before you share it with anyone.

**Sale or sharing.** The extension does not sell user information or share it with advertising networks, data brokers or other third parties, and does not use it for personalised, retargeted or interest-based advertising.

**Retention.** The developer keeps no database of user browsing information. Stored preferences stay in your browser or browser sync service until you change, clear or remove them.

**Chrome Web Store Limited Use.** The use of information received through browser APIs by FluffBlock Purity adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. Information is used only to provide the extension's user-facing filtering features.

**Third party platform.** FluffBlock Purity is independent and is not affiliated with, sponsored by or endorsed by Meta Platforms, Inc. Facebook is a trademark of Meta Platforms, Inc.

**Changes.** If data handling changes, this policy and any required disclosures will be updated before the change takes effect.

**Contact.** beachie41@gmail.com

## 6. Submission steps

**Chrome:** developer dashboard > Add new item > upload the zip > fill Store listing (section 1, assets) > Privacy tab (section 2) > Distribution (public, all regions) > Submit for review.
**Firefox:** addons.mozilla.org > Developer Hub > Submit a New Add-on > "On this site" > upload zip (validator runs) > source code: No > fill listing (sections 1 and 3) > Submit.
Review takes from hours to several days. A first listing that targets Facebook may get a manual review.
