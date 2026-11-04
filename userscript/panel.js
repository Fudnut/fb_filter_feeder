/*
 * Small in-page settings panel. It replaces the extension popup and
 * options page, and writes the same storage keys they do.
 */
(function initUserscriptPanel() {
  "use strict";

  const core = globalThis.__FFFC_CORE__;
  const MAIN = [
    ["enabled", "Enable filtering", true],
    ["hideSponsored", "Filter Ad & Sponsored", true],
    ["hideSuggested", "Filter Suggested posts", true],
    ["hideReels", "Filter Reels", false],
    ["hideStories", "Hide Stories tray", false],
    ["hideSuggestedGroups", "Hide Suggested Groups", false],
    ["hideGroupChats", "Hide Group chats", false]
  ];
  const SUGGESTED = [
    ["filterSuggestedFollow", "Follow"],
    ["filterSuggestedJoin", "Join"],
    ["filterSuggestedPeopleYouMayKnow", "People You May Know"],
    ["filterSuggestedForYou", "Suggested/Recommended For You"],
    ["filterSuggestedGroupPosts", "Suggested Groups"],
    ["filterSuggestedOther", "Other suggested content"]
  ].map(([key, label]) => [key, label, true]);
  const ACTIVITY = [
    ["filterAppGame", "Game and app posts"],
    ["filterBecameFriends", "Became Friends"],
    ["filterLikedPage", "Liked a Page"],
    ["filterJoinedGroup", "Joined a Group"],
    ["filterAttendingEvent", "Attending an Event"],
    ["filterAttendedEvent", "Attended an Event"],
    ["filterProductsShown", "Products Shown"],
    ["filterAiContent", "AI content label"]
  ].map(([key, label]) => [key, label, false]);
  const MODES = [
    ["hide", "Hide"],
    ["collapse", "Collapse"],
    ["debug", "Debug"]
  ];
  const MARKETPLACE = [
    ["off", "Off"],
    ["1", "24 hours"],
    ["7", "7 days"],
    ["30", "30 days"]
  ];
  const HOME_FEED = [
    ["off", "Facebook default"],
    ["all", "Most recent (chronological)"],
    ["favorites", "Favorites"],
    ["friends", "Friends"],
    ["groups", "Groups"],
    ["pages", "Pages"]
  ];
  const ALL_KEYS = [
    ...MAIN,
    ...SUGGESTED,
    ...ACTIVITY
  ].map(([key]) => key).concat([
    "enableWordFilters",
    "customWordFilters",
    "displayMode",
    "debugMode",
    "marketplaceDateFilter",
    "homeFeed"
  ]);

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font: 13px/1.35 -apple-system, system-ui, sans-serif; }
    .fab { position: fixed; left: 12px; bottom: 12px; z-index: 2147483647;
      width: 34px; height: 34px; border-radius: 50%; border: 0; cursor: pointer;
      background: #1877f2; color: #fff; font-weight: 700; opacity: .55;
      box-shadow: 0 2px 6px rgba(0,0,0,.3); }
    .fab:hover { opacity: 1; }
    .panel { position: fixed; left: 12px; bottom: 54px; z-index: 2147483647;
      width: 290px; max-height: calc(100vh - 80px); overflow: auto;
      background: #fff; color: #1c1e21; border-radius: 10px; padding: 12px;
      box-shadow: 0 6px 24px rgba(0,0,0,.3); }
    @media (prefers-color-scheme: dark) {
      .panel { background: #242526; color: #e4e6eb; }
      textarea { background: #3a3b3c; color: #e4e6eb; border-color: #555; }
    }
    [hidden] { display: none !important; }
    h1 { font-size: 15px; font-weight: 700; margin: 0 0 8px; display: flex; justify-content: space-between; }
    h1 small { font-size: 11px; font-weight: 400; opacity: .6; }
    label { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 3px 0; cursor: pointer; }
    .modes, .market { display: flex; gap: 10px; flex-wrap: wrap; padding: 4px 0; }
    .modes label, .market label { justify-content: flex-start; gap: 4px; }
    details { margin-top: 8px; border-top: 1px solid rgba(128,128,128,.3); padding-top: 6px; }
    summary { cursor: pointer; font-weight: 600; padding: 2px 0; }
    textarea { width: 100%; height: 90px; margin-top: 4px; padding: 4px; border: 1px solid #ccd0d5; border-radius: 6px; font-family: ui-monospace, monospace; }
    .row { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
    button.act { flex: 1; padding: 6px; border: 0; border-radius: 6px; cursor: pointer;
      background: #e4e6eb; color: #050505; font-weight: 600; }
    button.act:hover { background: #d8dadf; }
    .status { margin-top: 8px; font-size: 12px; opacity: .75; min-height: 16px; }
    .hint { font-size: 11px; opacity: .65; }
  `;

  let host = null;
  let panel = null;
  let statusLine = null;

  function checkbox(key, label) {
    return `<label><span>${label}</span><input type="checkbox" data-key="${key}"></label>`;
  }

  function radios(name, items) {
    return items
      .map(
        ([value, label]) =>
          `<label><input type="radio" name="${name}" value="${value}"><span>${label}</span></label>`
      )
      .join("");
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  }

  function build() {
    host = document.createElement("div");
    host.id = "fffc-userscript-panel";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}</style>
      <button class="fab" title="FB Feed Filter settings">FF</button>
      <div class="panel" hidden>
        <h1>Feed Filter <small>v${escapeHtml(FFFC_VERSION)}</small></h1>
        ${MAIN.map(([k, l]) => checkbox(k, escapeHtml(l))).join("")}
        <div class="modes">${radios("displayMode", MODES)}</div>
        <details>
          <summary>Suggested post types</summary>
          ${SUGGESTED.map(([k, l]) => checkbox(k, escapeHtml(l))).join("")}
        </details>
        <details>
          <summary>Activity posts</summary>
          ${ACTIVITY.map(([k, l]) => checkbox(k, escapeHtml(l))).join("")}
        </details>
        <details>
          <summary>Word filters</summary>
          ${checkbox("enableWordFilters", "Use word filters")}
          <div class="hint">One word or phrase per line.</div>
          <textarea spellcheck="false"></textarea>
          <div class="row"><button class="act" data-act="save-words">Save words</button></div>
        </details>
        <details>
          <summary>Marketplace sort</summary>
          <div class="hint">Force newest listings from the last:</div>
          <div class="market">${radios("marketplaceDateFilter", MARKETPLACE)}</div>
        </details>
        <details>
          <summary>Home feed</summary>
          <div class="hint">Open the home page on:</div>
          <div class="market">${radios("homeFeed", HOME_FEED)}</div>
        </details>
        <div class="row">
          <button class="act" data-act="reveal">Reveal all</button>
          <button class="act" data-act="reapply">Reapply</button>
        </div>
        <div class="status"></div>
      </div>`;
    panel = root.querySelector(".panel");
    statusLine = root.querySelector(".status");
    root.querySelector(".fab").addEventListener("click", togglePanel);

    for (const input of root.querySelectorAll("input[data-key]")) {
      input.addEventListener("change", () => {
        chrome.storage.sync.set({ [input.dataset.key]: input.checked }, refreshStatus);
      });
    }
    for (const input of root.querySelectorAll("input[name='displayMode']")) {
      input.addEventListener("change", () => {
        chrome.storage.sync.set(
          { displayMode: input.value, debugMode: input.value === "debug" },
          refreshStatus
        );
      });
    }
    for (const input of root.querySelectorAll("input[name='marketplaceDateFilter']")) {
      input.addEventListener("change", () => {
        chrome.storage.sync.set({ marketplaceDateFilter: input.value }, () => {
          statusLine.textContent = "Marketplace setting saved.";
        });
      });
    }
    for (const input of root.querySelectorAll("input[name='homeFeed']")) {
      input.addEventListener("change", () => {
        chrome.storage.sync.set({ homeFeed: input.value }, () => {
          statusLine.textContent = "Home feed setting saved.";
        });
      });
    }
    root.querySelector("[data-act='save-words']").addEventListener("click", () => {
      const textarea = root.querySelector("textarea");
      const filters = core.normalizeCustomWordFilters(textarea.value);
      textarea.value = filters.join("\n");
      chrome.storage.sync.set({ customWordFilters: textarea.value }, () => {
        statusLine.textContent = `${filters.length} word filter${filters.length === 1 ? "" : "s"} saved.`;
      });
    });
    root.querySelector("[data-act='reveal']").addEventListener("click", async () => {
      const result = await chrome.runtime.sendMessage({ type: "fffc:reveal-all" });
      statusLine.textContent = `Revealed ${result?.changed ?? 0} posts until reload or Reapply.`;
    });
    root.querySelector("[data-act='reapply']").addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "fffc:reapply" });
      refreshStatus();
    });

    (document.body || document.documentElement).appendChild(host);
    chrome.storage.onChanged.addListener(() => {
      if (!panel.hidden) {
        fillForm();
      }
    });
  }

  function fillForm() {
    const root = host.shadowRoot;
    chrome.storage.sync.get(ALL_KEYS, (stored) => {
      for (const [key, , fallback] of [...MAIN, ...SUGGESTED, ...ACTIVITY]) {
        root.querySelector(`input[data-key='${key}']`).checked =
          typeof stored[key] === "boolean" ? stored[key] : fallback;
      }
      root.querySelector("input[data-key='enableWordFilters']").checked =
        stored.enableWordFilters === true;
      const mode = core.normalizeDisplayMode(stored.displayMode, stored.debugMode === true);
      for (const input of root.querySelectorAll("input[name='displayMode']")) {
        input.checked = input.value === mode;
      }
      const market = ["off", "1", "7", "30"].includes(stored.marketplaceDateFilter)
        ? stored.marketplaceDateFilter
        : "off";
      for (const input of root.querySelectorAll("input[name='marketplaceDateFilter']")) {
        input.checked = input.value === market;
      }
      const homeFeed = HOME_FEED.some(([value]) => value === stored.homeFeed)
        ? stored.homeFeed
        : "off";
      for (const input of root.querySelectorAll("input[name='homeFeed']")) {
        input.checked = input.value === homeFeed;
      }
      const textarea = root.querySelector("textarea");
      if (root.activeElement !== textarea) {
        textarea.value = core.normalizeCustomWordFilters(stored.customWordFilters).join("\n");
      }
    });
  }

  async function refreshStatus() {
    const status = await chrome.runtime.sendMessage({ type: "fffc:get-status" });
    if (!status || !statusLine) {
      return;
    }
    const count = Object.values(status.current || {}).reduce(
      (sum, value) => sum + (typeof value === "number" ? value : 0),
      0
    );
    statusLine.textContent = `${count} item${count === 1 ? "" : "s"} filtered on this page.`;
  }

  function togglePanel() {
    if (!host) {
      build();
    }
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      fillForm();
      refreshStatus();
    }
  }

  function start() {
    // Facebook's own iframes (chat, ads) also match; only the top page gets a panel.
    if (window.top !== window.self) {
      return;
    }
    build();
    if (fffcGM.menu) {
      fffcGM.menu("Feed Filter settings", () => {
        if (panel.hidden) {
          togglePanel();
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
