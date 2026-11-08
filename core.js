// Shared, DOM-independent classifiers keep popup and content logic consistent.

(function initFeedFilterCore(global) {
  "use strict";

  const GENERATION = "feed-classifier-beta-2";
  if (global.__FFFC_CORE__?.generation === GENERATION) {
    return;
  }

  const DISPLAY_MODES = new Set(["hide", "collapse", "debug"]);
  const AD_LABEL_KINDS = new Map([
    ["ad", "ad"],
    ["advertiser link", "ad"],
    ["paid", "ad"],
    ["paid partnership", "ad"],
    ["sponsored", "sponsored"]
  ]);

  const ACTIVITY_FILTER_KEYS = Object.freeze([
    "filterAppGame",
    "filterBecameFriends",
    "filterLikedPage",
    "filterJoinedGroup",
    "filterAttendingEvent",
    "filterAttendedEvent",
    "filterProductsShown"
  ]);

  const SUGGESTED_SUBCATEGORY_KEYS = Object.freeze([
    "filterSuggestedFollow",
    "filterSuggestedJoin",
    "filterSuggestedPeopleYouMayKnow",
    "filterSuggestedForYou",
    "filterSuggestedGroupPosts",
    "filterSuggestedOther"
  ]);

  // Scoped to the post header by content.js and left opt-in - these match
  // Facebook's own generated activity-story phrasing (see AUDIT.md for the
  // source these were adapted from), not user-authored text.
  const FEED_EVENT_RULES = Object.freeze([
    {
      kind: "products-shown",
      setting: "filterProductsShown",
      reason: "feed-products-shown",
      confidence: 0.98,
      patterns: [/\bproducts shown\s*:/i, /\bproducts shown\b/i]
    },
    {
      kind: "became-friends",
      setting: "filterBecameFriends",
      reason: "feed-became-friends",
      confidence: 0.95,
      patterns: [
        /\bare now friends\b/i,
        /\bis now friends with\b/i,
        /\bbecame friends with\b/i,
        /\b(?:is|was) celebrating friendship\b/i,
        /\bmade \d+ friends on facebook\b/i
      ]
    },
    {
      kind: "liked-page",
      setting: "filterLikedPage",
      reason: "feed-liked-page",
      confidence: 0.91,
      patterns: [
        /\blikes? \d+ pages?\b/i,
        /\blikes? .{1,100} and \d+ other pages?\b/i,
        /\bwrote a recommendation for\b/i,
        /\bstarted following (?:the |a )?page\b/i,
        /\bliked (?:the |a )?page\b/i
      ]
    },
    {
      kind: "joined-group",
      setting: "filterJoinedGroup",
      reason: "feed-joined-group",
      confidence: 0.93,
      patterns: [
        /\bjoined (?:the |a )?(?:public |private )?group\b/i,
        /\bwas added to (?:the |a )?(?:public |private )?group\b/i,
        /\bwas invited to (?:the |a )?(?:public |private )?group\b/i,
        /\buploaded .{1,80} in the group\b/i
      ]
    },
    {
      kind: "attended-event",
      setting: "filterAttendedEvent",
      reason: "feed-attended-event",
      confidence: 0.94,
      patterns: [
        /\battended (?:the |an? )?event\b/i,
        /\bwere attending\b/i,
        /\bwas attending\b/i,
        /\bwent to .{1,120}\b/i
      ]
    },
    {
      kind: "attending-event",
      setting: "filterAttendingEvent",
      reason: "feed-attending-event",
      confidence: 0.91,
      patterns: [
        /\bis going to\b/i,
        /\bare going to\b/i,
        /\bplans? to attend\b/i,
        /\bis interested in\b/i,
        /\bare interested in\b/i,
        /\battending .{1,120}\b/i
      ]
    },
    {
      kind: "app-game",
      setting: "filterAppGame",
      reason: "feed-app-game",
      confidence: 0.9,
      patterns: [
        /\bplayed .{1,120}\b/i,
        /\bstarted playing\b/i,
        /\bstarted using\b/i,
        /\binvites? you to compete\b/i,
        /\bgames? your friends are playing\b/i,
        /\bclick to play\b/i
      ]
    }
  ]);

  // Structural labels are kept separate from user-authored post text.
  const SUGGESTION_LABELS = Object.freeze([
    /^suggested for you$/i,
    /^suggested posts?$/i,
    /^suggested posts? from a group$/i,
    /^recommended for you$/i,
    /^pages? you may like$/i,
    /^links? you may like$/i,
    /^page stories you may like$/i,
    /^events? you may like$/i,
    /^groups? you might like$/i,
    /^similar to posts/i,
    /^jobs near you$/i,
    /^people you may know$/i,
    /^suggested groups?$/i,
    /^suggested reels?$/i
  ]);

  function normalizeText(value) {
    return String(value ?? "")
      .replace(
        /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g,
        ""
      )
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const MAX_CUSTOM_WORD_FILTERS = 100;
  const MAX_CUSTOM_WORD_FILTER_LENGTH = 80;
  const MAX_CUSTOM_WORD_FILTER_CHARS = 6000;

  /*
   * Normalize once at the settings boundary so the classifier receives a
   * compact, deduplicated list instead of rebuilding it for every story.
   */
  function normalizeCustomWordFilters(value) {
    const source = Array.isArray(value)
      ? value
      : String(value ?? "").split(/\r?\n/);
    const result = [];
    const seen = new Set();
    let storedCharacters = 0;

    for (const rawTerm of source) {
      const term = normalizeText(rawTerm).slice(
        0,
        MAX_CUSTOM_WORD_FILTER_LENGTH
      );
      if (term.length < 2) {
        continue;
      }
      const comparison = term.toLocaleLowerCase();
      if (seen.has(comparison)) {
        continue;
      }
      const nextCharacters = storedCharacters + term.length;
      if (
        result.length >= MAX_CUSTOM_WORD_FILTERS ||
        nextCharacters > MAX_CUSTOM_WORD_FILTER_CHARS
      ) {
        break;
      }
      seen.add(comparison);
      result.push(term);
      storedCharacters = nextCharacters;
    }
    return result;
  }

  function matchCustomWordFilter(value, filters) {
    const text = normalizeText(value).toLocaleLowerCase();
    if (!text) {
      return null;
    }
    for (const term of filters) {
      if (text.includes(term.toLocaleLowerCase())) {
        return term;
      }
    }
    return null;
  }

  function normalizeDisclosureLabel(value) {
    return normalizeText(value)
      .replace(/^[·•]\s*/, "")
      .replace(/\s*[·•]\s*$/, "")
      .trim()
      .toLowerCase();
  }

  function adKindForLabel(value) {
    return AD_LABEL_KINDS.get(normalizeDisclosureLabel(value)) || null;
  }

  function matchesAdDisclosureLabel(value) {
    return adKindForLabel(value) !== null;
  }

  function matchesPaidForByDisclosure(value) {
    const text = normalizeText(value);
    return (
      text.length >= 25 &&
      text.length <= 240 &&
      /^sponsored\s*[·•]\s*paid for by\s+\S(?:.*\S)?$/i.test(text)
    );
  }

  function matchesSuggestionLabel(value) {
    const text = normalizeText(value);
    return SUGGESTION_LABELS.some((pattern) => pattern.test(text));
  }

  // Meta's own "this content is AI-generated/edited" disclosure, rendered
  // as plain byline text next to the post timestamp - the same position
  // "Suggested for you" uses (see the header-geometry fallback in
  // exactSuggestionLabel). Not obfuscated the way ad labels are, since
  // Meta has no incentive to hide it from blockers.
  const AI_CONTENT_LABELS = Object.freeze([
    /^ai info$/i,
    /^ai content$/i,
    /^ai[- ]generated$/i
  ]);

  function matchesAiContentLabel(value) {
    const text = normalizeText(value);
    return AI_CONTENT_LABELS.some((pattern) => pattern.test(text));
  }

  // Maps a suggestion detector's reason/label pair to one of the opt-in
  // SUGGESTED_SUBCATEGORY_KEYS, so each detected post can be gated by its
  // specific kind rather than the single all-or-nothing hideSuggested flag.
  function suggestedSubcategoryKey(reason, label) {
    if (reason === "suggested-header-follow") {
      return "filterSuggestedFollow";
    }
    if (reason === "suggested-header-join") {
      return "filterSuggestedJoin";
    }
    if (reason === "exact-suggestion-label") {
      const text = normalizeText(label).toLowerCase();
      if (text === "people you may know") {
        return "filterSuggestedPeopleYouMayKnow";
      }
      if (text === "suggested for you" || text === "recommended for you") {
        return "filterSuggestedForYou";
      }
      if (/^suggested groups?$/.test(text)) {
        return "filterSuggestedGroupPosts";
      }
    }
    return "filterSuggestedOther";
  }

  function matchesAdDisclosureUrl(value) {
    const text = String(value || "").trim().replace(/&amp;/g, "&");
    if (!text) {
      return false;
    }

    try {
      const url = new URL(text, "https://www.facebook.com/");
      const hostname = url.hostname.toLowerCase();
      const facebookHost =
        hostname === "facebook.com" || hostname.endsWith(".facebook.com");
      if (!facebookHost) {
        return false;
      }

      if (/^\/ads\/about\/?$/.test(url.pathname)) {
        return true;
      }

      if (/^\/l\.php$/.test(url.pathname)) {
        const destination = url.searchParams.get("u");
        return Boolean(
          destination &&
            destination !== text &&
            matchesAdDisclosureUrl(destination)
        );
      }
    } catch (_error) {
      return false;
    }
    return false;
  }

  function matchesFacebookReelUrl(value) {
    const text = String(value || "").trim().replace(/&amp;/g, "&");
    if (!text) {
      return false;
    }
    try {
      const url = new URL(text, "https://www.facebook.com/");
      const hostname = url.hostname.toLowerCase();
      const facebookHost =
        hostname === "facebook.com" || hostname.endsWith(".facebook.com");
      return (
        facebookHost &&
        /^\/reels?(?:\/|$)/i.test(url.pathname)
      );
    } catch (_error) {
      return false;
    }
  }

  function suggestionActionKind(value) {
    const text = normalizeText(value)
      .replace(/^[·•]\s*/, "")
      .replace(/\s*[·•]\s*$/, "")
      .toLowerCase();
    if (text === "interested") {
      return "interested";
    }
    if (text === "not interested") {
      return "not-interested";
    }
    if (text === "follow") {
      return "follow";
    }
    if (text === "join" || text === "join group") {
      return "join";
    }
    return null;
  }

  function isFacebookGroupStoryHref(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return false;
    }
    let pathname;
    try {
      pathname = new URL(raw, "https://www.facebook.com/").pathname;
    } catch (_error) {
      return false;
    }
    const match = pathname.match(/^\/groups\/([^/?#]+)(?:[/?#]|$)/i);
    if (!match) {
      return false;
    }
    return !new Set([
      "category",
      "create",
      "discover",
      "feed",
      "for_you",
      "joins",
      "notifications",
      "search"
    ]).has(match[1].toLowerCase());
  }

  function hasSuggestionFeedbackPair(values = []) {
    const actions = new Set(
      Array.from(values, (value) => suggestionActionKind(value)).filter(Boolean)
    );
    return actions.has("interested") && actions.has("not-interested");
  }

  function groupGlyphRecords(records, topTolerance = 3) {
    const groups = [];
    const sorted = Array.from(records || [])
      .filter((record) => record?.visible !== false)
      .filter((record) => Number.isFinite(Number(record.left)))
      .filter((record) => Number.isFinite(Number(record.top)))
      .filter((record) => normalizeText(record.text).length > 0)
      .sort(
        (left, right) =>
          Number(left.top) - Number(right.top) ||
          Number(left.left) - Number(right.left)
      );

    for (const record of sorted) {
      let group = groups.find(
        (candidate) =>
          Math.abs(candidate.top - Number(record.top)) <= topTolerance
      );
      if (!group) {
        group = { top: Number(record.top), records: [] };
        groups.push(group);
      }
      group.records.push(record);
    }
    return groups;
  }

  function candidateGlyphStrings(records = []) {
    const candidates = new Set();
    const usable = Array.from(records).filter(
      (record) =>
        record &&
        record.visible !== false &&
        normalizeText(record.text).length > 0
    );

    for (const group of groupGlyphRecords(usable)) {
      candidates.add(
        normalizeText(
          group.records
            .slice()
            .sort(
              (left, right) =>
                Number(left.left) - Number(right.left)
            )
            .map((record) => record.text)
            .join("")
        )
      );

      const ordered = group.records.filter((record) =>
        Number.isFinite(Number(record.order))
      );
      if (ordered.length >= 2) {
        candidates.add(
          normalizeText(
            ordered
              .slice()
              .sort(
                (left, right) =>
                  Number(left.order) - Number(right.order)
              )
              .map((record) => record.text)
              .join("")
          )
        );
      }
    }

    const orderedAcrossRows = usable.filter((record) =>
      Number.isFinite(Number(record.order))
    );
    if (orderedAcrossRows.length >= 2) {
      candidates.add(
        normalizeText(
          orderedAcrossRows
            .slice()
            .sort(
              (left, right) =>
                Number(left.order) - Number(right.order)
            )
            .map((record) => record.text)
            .join("")
        )
      );
    }

    return Array.from(candidates).filter(Boolean);
  }

  function decodeExactAdLabel(records = []) {
    return (
      candidateGlyphStrings(records).find(matchesAdDisclosureLabel) || null
    );
  }

  function classifyFeedEvent(value) {
    const text = normalizeText(value);
    for (const rule of FEED_EVENT_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(text))) {
        return {
          kind: rule.kind,
          setting: rule.setting,
          reason: rule.reason,
          confidence: rule.confidence
        };
      }
    }
    return null;
  }

  function normalizeDisplayMode(value, debugMode = false) {
    if (DISPLAY_MODES.has(value)) {
      return value;
    }
    return debugMode ? "debug" : "hide";
  }

  function rectangleEdges(value) {
    if (!value || typeof value !== "object") {
      return null;
    }
    const left = Number(value.left);
    const top = Number(value.top);
    const width = Number(value.width);
    const height = Number(value.height);
    if (![left, top, width, height].every(Number.isFinite)) {
      return null;
    }
    return {
      left,
      top,
      width,
      height,
      right: Number.isFinite(Number(value.right))
        ? Number(value.right)
        : left + width,
      bottom: Number.isFinite(Number(value.bottom))
        ? Number(value.bottom)
        : top + height
    };
  }

  function isMarketplaceCardGeometry(cardValue, labelValue, mediaValue) {
    const card = rectangleEdges(cardValue);
    const label = rectangleEdges(labelValue);
    const media = rectangleEdges(mediaValue);
    if (!card || !label || !media) {
      return false;
    }

    const labelInside =
      label.left >= card.left - 12 &&
      label.right <= card.right + 12 &&
      label.top >= card.top &&
      label.bottom <= card.bottom + 12;
    const mediaInside =
      media.left >= card.left - 18 &&
      media.right <= card.right + 18 &&
      media.top >= card.top - 12 &&
      media.bottom <= card.bottom + 12;
    const boundedCard =
      card.width >= 140 &&
      card.width <= 620 &&
      card.height >= 150 &&
      card.height <= 980;
    const substantialMedia =
      media.width >= Math.max(110, card.width * 0.42) &&
      media.height >= 90;
    const mediaBeforeLabel =
      media.top < label.top - 20 &&
      label.top >= card.top + Math.min(70, card.height * 0.14);

    return (
      boundedCard &&
      labelInside &&
      mediaInside &&
      substantialMedia &&
      mediaBeforeLabel
    );
  }

  /*
   * Facebook Marketplace advertising redirects currently retain the semantic
   * placement value `Facebook_Marketplace`, sometimes nested inside one or
   * more encoded redirect parameters. Match that placement value only; do not
   * use advertiser names, campaign IDs, ad-set IDs or generated CSS classes.
   */
  function matchesMarketplacePlacementUrl(value) {
    let decoded = String(value || "")
      .replace(/&amp;/gi, "&")
      .replace(/\\u0026/gi, "&")
      .replace(/\\x26/gi, "&");
    if (!decoded) {
      return false;
    }
    for (let pass = 0; pass < 4; pass += 1) {
      if (
        /(?:^|[?&#])placement=facebook_marketplace(?:[&#]|$)/i.test(
          decoded
        )
      ) {
        return true;
      }
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) {
          break;
        }
        decoded = next;
      } catch (_error) {
        break;
      }
    }
    return /(?:^|[?&#])placement=facebook_marketplace(?:[&#]|$)/i.test(
      decoded
    );
  }

  function surfaceKind(pathname) {
    const path = String(pathname || "/").toLowerCase();
    if (path.startsWith("/marketplace")) {
      return "marketplace";
    }
    if (path.startsWith("/feeds")) {
      return "feeds";
    }
    if (path === "/" || path === "") {
      return "home";
    }
    return "other";
  }

  function sortedCounter(counter = {}) {
    return Object.fromEntries(
      Object.entries(counter).sort(
        (left, right) => Number(right[1]) - Number(left[1])
      )
    );
  }

  function safeObject(value) {
    return value && typeof value === "object" ? value : {};
  }

  function buildDiagnosticReport(extensionVersion, status = {}) {
    const runtime = safeObject(status.runtime);
    const current = safeObject(status.current);
    const session = safeObject(status.session);
    const health = safeObject(status.health);
    const settings = safeObject(status.settings);

    return {
      schemaVersion: 3,
      generatedAt: new Date().toISOString(),
      extensionVersion: String(extensionVersion || "unknown"),
      detectorGeneration: GENERATION,
      surface: String(status.surface || "unknown").slice(0, 32),
      language: String(status.language || "unknown").slice(0, 24),
      runtime: {
        contentScriptVersion: String(
          runtime.contentScriptVersion || "unknown"
        ).slice(0, 32)
      },
      settings: {
        enabled: settings.enabled === true,
        hideSponsored: settings.hideSponsored === true,
        hideSuggested: settings.hideSuggested === true,
        hideReels: settings.hideReels === true,
        hideStories: settings.hideStories === true,
        hideSuggestedGroups: settings.hideSuggestedGroups === true,
        hideGroupChats: settings.hideGroupChats === true,
        enableWordFilters: settings.enableWordFilters === true,
        customWordFilterCount: Number(settings.customWordFilterCount || 0),
        displayMode: normalizeDisplayMode(settings.displayMode),
        activityFiltersEnabled: Number(settings.activityFiltersEnabled || 0)
      },
      current: {
        ad: Number(current.ad || 0),
        sponsored: Number(current.sponsored || 0),
        suggested: Number(current.suggested || 0),
        reel: Number(current.reel || 0),
        wordFilter: Number(current.wordFilter || 0),
        activity: Number(current.activity || 0),
        rightRailSponsored: Number(current.rightRailSponsored || 0),
        suggestedGroups: Number(current.suggestedGroups || 0),
        groupChats: Number(current.groupChats || 0),
        storiesTray: Number(current.storiesTray || 0),
        marketplace: Number(current.marketplace || 0),
        marketplaceAds: Number(current.marketplaceAds || 0),
        revealed: Number(current.revealed || 0),
        byReason: sortedCounter(safeObject(current.byReason)),
        bySource: sortedCounter(safeObject(current.bySource))
      },
      session: {
        startedAt: String(session.startedAt || ""),
        uptimeSeconds: Number(session.uptimeSeconds || 0),
        uniqueMatches: Number(session.uniqueMatches || 0),
        classificationEvents: Number(session.classificationEvents || 0),
        reclassifications: Number(session.reclassifications || 0),
        userReveals: Number(session.userReveals || 0),
        byReason: sortedCounter(safeObject(session.byReason)),
        bySource: sortedCounter(safeObject(session.bySource))
      },
      health: Object.fromEntries(
        Object.entries(health)
          .filter(([, value]) =>
            ["number", "boolean"].includes(typeof value)
          )
          .map(([key, value]) => [key, value])
      )
    };
  }

  /*
   * Custom word filters are text the user typed, so they are kept in
   * storage.local and never synced to the browser account. Earlier builds
   * stored them in storage.sync; move any such value over once, then
   * remove the synced copy.
   */
  function loadCustomWordFilters(callback) {
    chrome.storage.local.get(["customWordFilters"], (local) => {
      if (typeof local.customWordFilters === "string") {
        callback(local.customWordFilters);
        return;
      }
      chrome.storage.sync.get(["customWordFilters"], (old) => {
        const value =
          typeof old.customWordFilters === "string" ? old.customWordFilters : "";
        if (value) {
          chrome.storage.local.set({ customWordFilters: value }, () => {
            chrome.storage.sync.remove?.("customWordFilters");
          });
        }
        callback(value);
      });
    });
  }

  global.__FFFC_CORE__ = Object.freeze({
    generation: GENERATION,
    ACTIVITY_FILTER_KEYS,
    SUGGESTED_SUBCATEGORY_KEYS,
    suggestedSubcategoryKey,
    matchesAiContentLabel,
    normalizeText,
    normalizeCustomWordFilters,
    loadCustomWordFilters,
    matchCustomWordFilter,
    normalizeDisclosureLabel,
    adKindForLabel,
    matchesAdDisclosureLabel,
    matchesPaidForByDisclosure,
    matchesSuggestionLabel,
    matchesAdDisclosureUrl,
    matchesFacebookReelUrl,
    suggestionActionKind,
    isFacebookGroupStoryHref,
    hasSuggestionFeedbackPair,
    candidateGlyphStrings,
    decodeExactAdLabel,
    classifyFeedEvent,
    normalizeDisplayMode,
    isMarketplaceCardGeometry,
    matchesMarketplacePlacementUrl,
    surfaceKind,
    buildDiagnosticReport
  });
})(globalThis);
