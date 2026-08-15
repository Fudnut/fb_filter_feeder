/*
 * One lifecycle owns feed discovery, hydration rescans, classification and
 * presentation. Keeping those responsibilities together prevents competing
 * observers from marking the same recycled React story differently.
 */

(function startFeedFilter() {
  "use strict";

  if (globalThis.__FEED_FILTER_CONTENT_BETA_2__) {
    return;
  }
  globalThis.__FEED_FILTER_CONTENT_BETA_2__ = true;
  // Patched 2026-07-31: story-containment fallback for header geometry
  // (Reels-format ad cards) + paid-for-by text fallback.

  /*
   * Facebook Marketplace only sorts by newest listings when the user
   * manually picks a "Date listed" filter each visit - it defaults to an
   * algorithmic/relevance order otherwise. Confirmed via captured URLs
   * (2026-08-12) that Facebook encodes that filter directly in the URL on
   * a category search page: ?daysSinceListed=1/7/30 for 24 hours/7 days/
   * 30 days. Forcing it via a URL redirect - rather than simulating a
   * click on Facebook's own filter dropdown - means this doesn't depend
   * on any Marketplace DOM structure at all, only a URL parameter that's
   * been directly observed. Confirmed on category/search listing pages;
   * the plain Marketplace browse root is untested - if Facebook ignores
   * the parameter there, this is a harmless no-op, not a broken redirect.
   *
   * exact=false on Facebook's own category URLs likely loosens the query
   * to include algorithmically-related listings, which may not honor the
   * date filter as strictly as a literal search does - flipping it to
   * true (user testing, 2026-08-12) only when Facebook's URL already sets
   * it false, never manufacturing the param on pages that don't have it.
   *
   * "All" and "never touched" are indistinguishable from the URL alone -
   * both mean daysSinceListed is simply absent (confirmed 2026-08-12: a
   * manual "All" selection removes the parameter rather than setting it
   * to a distinct value). So a bare "is it missing?" check can't tell a
   * fresh category from a deliberate All choice, and kept forcing the
   * default straight back after the user cleared it. Tracking the
   * category/search context (the URL minus daysSinceListed/exact) fixes
   * this: only force the default when the context itself changed, not
   * every time the parameter is merely absent. Kept in sessionStorage
   * rather than a plain variable because our own redirect is a full
   * location.replace() reload (required for Facebook to actually react
   * to the URL change) which would otherwise wipe an in-memory value and
   * immediately misread the reloaded page as a fresh context again.
   */
  const MARKETPLACE_DATE_FILTER_VALUES = new Set(["1", "7", "30"]);
  const MARKETPLACE_EXCLUDED_PATH =
    /^\/marketplace\/(item|you|inbox|create|saved|notifications)(\/|$)/;
  const MARKETPLACE_CONTEXT_STORAGE_KEY = "__fffc_marketplace_context__";
  let lastMarketplaceRedirectHref = null;

  function marketplaceContextKey(url) {
    const params = new URLSearchParams(url.search);
    params.delete("daysSinceListed");
    params.delete("exact");
    return `${url.pathname}?${params.toString()}`;
  }

  function readLastMarketplaceContext() {
    try {
      return sessionStorage.getItem(MARKETPLACE_CONTEXT_STORAGE_KEY);
    } catch (_error) {
      return null;
    }
  }

  function writeLastMarketplaceContext(key) {
    try {
      sessionStorage.setItem(MARKETPLACE_CONTEXT_STORAGE_KEY, key);
    } catch (_error) {
      // sessionStorage can throw under restricted storage settings; losing
      // this memory just degrades to "always apply the default" instead
      // of breaking anything.
    }
  }

  function applyMarketplaceDateFilter() {
    if (
      !/^\/marketplace(\/|$)/.test(location.pathname) ||
      MARKETPLACE_EXCLUDED_PATH.test(location.pathname) ||
      location.href === lastMarketplaceRedirectHref
    ) {
      return;
    }
    const url = new URL(location.href);
    const contextKey = marketplaceContextKey(url);
    const sameContext = contextKey === readLastMarketplaceContext();
    writeLastMarketplaceContext(contextKey);

    if (url.searchParams.has("daysSinceListed")) {
      return;
    }
    const needsExactFix = url.searchParams.get("exact") === "false";
    if (sameContext && !needsExactFix) {
      return;
    }
    chrome.storage.sync.get(["marketplaceDateFilter"], (stored) => {
      const days = stored.marketplaceDateFilter;
      if (!MARKETPLACE_DATE_FILTER_VALUES.has(days)) {
        return;
      }
      if (!sameContext) {
        url.searchParams.set("daysSinceListed", days);
      }
      if (needsExactFix) {
        url.searchParams.set("exact", "true");
      }
      lastMarketplaceRedirectHref = url.toString();
      location.replace(lastMarketplaceRedirectHref);
    });
  }
  applyMarketplaceDateFilter();

  const core = globalThis.__FFFC_CORE__;
  const BUILD_VERSION =
    chrome.runtime.getManifest().version_name ||
    chrome.runtime.getManifest().version;
  const STORY_SELECTOR = "div[aria-posinset]";
  const ARTICLE_SELECTOR = "div[role='article']";
  const MAIN_SELECTOR = "div[role='main'],body[data-fffc-main-fallback='1']";
  const STORY_GEOMETRY_FALLBACK_SELECTOR =
    `${ARTICLE_SELECTOR},h2,h3,h4,h5,[role='heading'],` +
    "[data-ad-rendering-role='profile_name']," +
    "[data-ad-rendering-role='story_message'],img,video";
  const RECONCILE_INTERVAL_MS = 2000;
  const SUGGESTION_SETTLE_MS = 360;
  const FILTER_LAYOUT_QUIET_MS = 240;
  const STARTUP_RESCAN_DELAYS = [100, 350, 800, 1600, 3200, 6000, 10000];
  const MATCH_MISS_LIMIT = 4;
  const HEADER_EXCLUSIONS =
    "[data-ad-rendering-role='story_message']," +
    "[data-ad-rendering-role='title']," +
    "[data-ad-rendering-role='description']," +
    "[data-ad-rendering-role^='cta']," +
    "[data-ad-rendering-role='like_button']," +
    "[data-ad-rendering-role='comment_button']," +
    "[data-ad-rendering-role='share_button']";
  const DEFAULTS = Object.freeze({
    enabled: true,
    hideSponsored: true,
    hideSuggested: true,
    hideReels: false,
    hideStories: false,
    hideSuggestedGroups: false,
    hideGroupChats: false,
    enableWordFilters: false,
    customWordFilters: "",
    displayMode: "hide",
    filterAppGame: false,
    filterBecameFriends: false,
    filterLikedPage: false,
    filterJoinedGroup: false,
    filterAttendingEvent: false,
    filterAttendedEvent: false,
    filterProductsShown: false,
    filterAiContent: false,
    filterSuggestedFollow: true,
    filterSuggestedJoin: true,
    filterSuggestedPeopleYouMayKnow: true,
    filterSuggestedForYou: true,
    filterSuggestedGroupPosts: true,
    filterSuggestedOther: true
  });
  const ACTIVITY_KIND_SETTINGS = Object.freeze({
    "app-game": "filterAppGame",
    "became-friends": "filterBecameFriends",
    "liked-page": "filterLikedPage",
    "joined-group": "filterJoinedGroup",
    "attending-event": "filterAttendingEvent",
    "attended-event": "filterAttendedEvent",
    "products-shown": "filterProductsShown"
  });

  let settings = { ...DEFAULTS };
  let observerStarted = false;
  let scanFrame = null;
  let scanFallbackTimer = null;
  let auxiliaryScanTimer = null;
  let auxiliaryAdmitVisible = false;
  let viewportRescanTimer = null;
  let reconciliationPass = 0;
  let lastLocationHref = location.href;
  let lastFilterMutationAt = -Infinity;
  const queue = new Set();
  const viewportStoryCohort = new Set();
  const viewportModuleCohort = new Set();
  const viewportReelModuleCohort = new Set();
  const viewportStoriesTrayCohort = new Set();
  const viewportMarketplaceCohort = new Set();
  const observedStories = new WeakSet();
  const deferredOffscreenStories = new WeakSet();
  const fallbackGeometryStories = new WeakSet();
  const observedMarketplaceCards = new WeakSet();
  const storyState = new WeakMap();
  const markedRightRailBranches = new WeakSet();
  const counters = {
    startedAt: new Date().toISOString(),
    reconciliationPasses: 0,
    mutationBatches: 0,
    startupRescans: 0,
    storyCandidatesSeen: 0,
    orphanArticleCandidatesSeen: 0,
    geometryFallbackCandidatesSeen: 0,
    storiesObserved: 0,
    viewportCohortRefreshes: 0,
    viewportEntries: 0,
    offscreenStoriesDeferred: 0,
    storyGeometryFallbackAdmissions: 0,
    layoutScrollsSuppressed: 0,
    postsScanned: 0,
    queueFlushes: 0,
    queueFallbackFlushes: 0,
    queueHighWater: 0,
    navigationRescans: 0,
    visibilityRescans: 0,
    viewportRescans: 0,
    headerCandidatesChecked: 0,
    adLabelExcludedByHeadingAncestor: 0,
    suggestionActionExcludedByHeadingAncestor: 0,
    renderedHeaderTextCandidates: 0,
    renderedHeaderTokenMatches: 0,
    nestedObjectCandidates: 0,
    scrambledHeaderCandidates: 0,
    ctaButtonMarkerMatches: 0,
    ctaButtonGroupOriginProtections: 0,
    directAdLabelMatches: 0,
    paidForByDisclosureMatches: 0,
    glyphDecodeMatches: 0,
    svgLabelMatches: 0,
    labelledReferenceMatches: 0,
    disclosureLinkMatches: 0,
    canvasHeaderCandidates: 0,
    adMatches: 0,
    sponsoredMatches: 0,
    suggestionLabelMatches: 0,
    aiContentMatches: 0,
    suggestionDismissControlMatches: 0,
    ambiguousDismissControlsRejected: 0,
    suggestionHeaderActionMatches: 0,
    recommendationPairMatches: 0,
    suggestionModuleHeadings: 0,
    suggestionModuleMatches: 0,
    groupOriginProtections: 0,
    foreignActorProtections: 0,
    activityMatches: 0,
    reelStoryMatches: 0,
    reelModuleHeadings: 0,
    reelModuleMatches: 0,
    storiesTrayMatches: 0,
    customWordFilterCandidates: 0,
    customWordFilterMatches: 0,
    marketplaceLabelCandidates: 0,
    marketplacePlacementLinks: 0,
    marketplacePlacementCards: 0,
    marketplaceDynamicAdmissions: 0,
    marketplaceCardsScanned: 0,
    marketplaceMatches: 0,
    rightRailSponsoredHeadings: 0,
    rightRailSponsoredModules: 0,
    rightRailSuggestedGroupsHeadings: 0,
    rightRailSuggestedGroupsModules: 0,
    rightRailGroupChatsHeadings: 0,
    rightRailGroupChatsModules: 0,
    rightRailProtectedStops: 0,
    rawDecoyStringsRejected: 0,
    uniqueMatches: 0,
    classificationEvents: 0,
    reclassifications: 0,
    clearedRecycledMatches: 0,
    userReveals: 0,
    byReason: Object.create(null),
    bySource: Object.create(null)
  };

  const intersectionObserver =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
            if (!entry.isIntersecting) {
              continue;
            }
              counters.viewportEntries += 1;
              if (!viewportStoryCohort.has(entry.target)) {
                continue;
              }
              queueStory(entry.target, "intersection");
              window.setTimeout(
                () => queueStory(entry.target, "intersection-settled"),
                220
              );
            }
          },
          { root: null, rootMargin: "0px", threshold: 0 }
        )
      : null;

  function increment(counter, key) {
    counter[key] = Number(counter[key] || 0) + 1;
  }

  const BOOLEAN_SETTING_KEYS = Object.freeze([
    "enabled",
    "hideSponsored",
    "hideSuggested",
    "hideReels",
    "hideStories",
    "hideSuggestedGroups",
    "hideGroupChats",
    "enableWordFilters",
    "filterAiContent"
  ]);

  function normalizeSettings(stored = {}) {
    const normalized = {
      customWordFilters: core.normalizeCustomWordFilters(
        stored.customWordFilters
      ),
      displayMode: core.normalizeDisplayMode(
        stored.displayMode,
        stored.debugMode === true
      )
    };
    for (const key of [
      ...BOOLEAN_SETTING_KEYS,
      ...core.ACTIVITY_FILTER_KEYS,
      ...core.SUGGESTED_SUBCATEGORY_KEYS
    ]) {
      normalized[key] =
        typeof stored[key] === "boolean" ? stored[key] : DEFAULTS[key];
    }
    return normalized;
  }

  function applySettings(next) {
    settings = normalizeSettings(next);
    const root = document.documentElement;
    root.dataset.fffcEnabled = settings.enabled ? "1" : "0";
    root.dataset.fffcHideSponsored = settings.hideSponsored ? "1" : "0";
    root.dataset.fffcHideSuggested = settings.hideSuggested ? "1" : "0";
    root.dataset.fffcHideReels = settings.hideReels ? "1" : "0";
    root.dataset.fffcHideStories = settings.hideStories ? "1" : "0";
    root.dataset.fffcHideSuggestedGroups = settings.hideSuggestedGroups
      ? "1"
      : "0";
    root.dataset.fffcHideGroupChats = settings.hideGroupChats ? "1" : "0";
    root.dataset.fffcEnableWordFilters =
      settings.enableWordFilters && settings.customWordFilters.length
        ? "1"
        : "0";
    root.dataset.fffcMode = settings.displayMode;
  }

  function readSettings() {
    chrome.storage.sync.get(
      [
        "enabled",
        "hideSponsored",
        "hideSuggested",
        "hideReels",
        "hideStories",
        "hideSuggestedGroups",
        "hideGroupChats",
        "enableWordFilters",
        "filterAiContent",
        "customWordFilters",
        "displayMode",
        "debugMode",
        ...core.ACTIVITY_FILTER_KEYS,
        ...core.SUGGESTED_SUBCATEGORY_KEYS
      ],
      (stored) => {
        applySettings(stored);
        runReconciliation("settings");
      }
    );
  }

  function hasPositiveRect(rectangle) {
    return Boolean(
      rectangle &&
        Number(rectangle.width) > 0 &&
        Number(rectangle.height) > 0
    );
  }

  function isExcludedRegion(element) {
    return Boolean(
      element?.closest?.(
        "[role='complementary'],[role='dialog'],[role='navigation']"
      )
    );
  }

  function mainOwner(element) {
    return element?.closest?.(MAIN_SELECTOR) || null;
  }

  /*
   * Every main-feed discovery path (storyCandidates, marketplace, reel
   * modules, suggestion modules) requires a div[role='main'] landmark.
   * Right-rail scanning does not, which is why it can keep working even
   * when the whole main-feed pipeline goes dark. If Facebook ever serves a
   * feed layout with no role='main'] element on the page at all, fall back
   * to treating <body> as the landmark rather than silently discovering
   * zero stories. Re-checks each call so it self-corrects the moment a real
   * landmark appears (e.g. after an SPA navigation).
   */
  function ensureMainLandmarkFallback() {
    const hasRealMain = Boolean(document.querySelector("div[role='main']"));
    if (!document.body) {
      return;
    }
    if (hasRealMain) {
      if (document.body.hasAttribute("data-fffc-main-fallback")) {
        document.body.removeAttribute("data-fffc-main-fallback");
      }
      return;
    }
    if (!document.body.hasAttribute("data-fffc-main-fallback")) {
      document.body.setAttribute("data-fffc-main-fallback", "1");
    }
  }

  function outermostPositionedStory(element) {
    let story = element?.closest?.(STORY_SELECTOR) || null;
    if (!story) {
      return null;
    }
    const owner = mainOwner(story);
    while (story.parentElement) {
      const ancestor = story.parentElement.closest(STORY_SELECTOR);
      if (!ancestor || mainOwner(ancestor) !== owner) {
        break;
      }
      story = ancestor;
    }
    return story;
  }

  function isFeedStory(element) {
    if (!(element instanceof Element) || isExcludedRegion(element)) {
      return false;
    }
    if (!mainOwner(element)) {
      return false;
    }
    const surface = core.surfaceKind(location.pathname);
    return surface === "home" || surface === "feeds";
  }

  function storyCandidates() {
    if (!["home", "feeds"].includes(core.surfaceKind(location.pathname))) {
      return [];
    }
    const results = [];
    const seen = new Set();
    for (const main of document.querySelectorAll(MAIN_SELECTOR)) {
      for (const candidate of main.querySelectorAll(STORY_SELECTOR)) {
        const story = outermostPositionedStory(candidate);
        if (story && isFeedStory(story) && !seen.has(story)) {
          seen.add(story);
          results.push(story);
        }
      }
      /*
       * Facebook can render a mixed feed while it hydrates: settled stories
       * already have aria-posinset, while neighbouring role=article stories
       * do not. The alpha.1 fallback admitted these articles only when the
       * whole page had zero positioned stories, leaving mixed-feed stragglers
       * invisible until a reload.
       */
      for (const article of main.querySelectorAll(ARTICLE_SELECTOR)) {
        if (
          !article.closest(STORY_SELECTOR) &&
          !article.querySelector(STORY_SELECTOR) &&
          isFeedStory(article) &&
          !seen.has(article)
        ) {
          seen.add(article);
          results.push(article);
        }
      }
    }
    if (!results.some(hasSubstantialText)) {
      for (const block of fallbackVisibleContentBlocks()) {
        if (!seen.has(block)) {
          seen.add(block);
          /*
           * A geometry-picked block is a plain div chosen by size/text/
           * visibility alone, not a semantic post boundary - it could be
           * Facebook's own virtualized-list item wrapper rather than an
           * isolated post. display:none fully removes an element from
           * layout; if Facebook's own scroll/render logic measures that
           * wrapper, doing so can break the feed outright (2026-08-15,
           * Mac Chrome tester "Rob": feed loaded fine in debug mode,
           * which never hides anything, but went completely blank in
           * hide mode). This marker lets content.css route these through
           * the layout-preserving collapse treatment instead, even when
           * the user's mode is "hide".
           */
          block.dataset.fffcGeometryFallback = "1";
          counters.geometryFallbackCandidatesSeen += 1;
          results.push(block);
        }
      }
    }
    return results;
  }

  function closestStory(element) {
    if (!(element instanceof Element)) {
      return null;
    }
    const positioned = outermostPositionedStory(element);
    if (positioned && isFeedStory(positioned)) {
      return positioned;
    }
    const article = element.closest(ARTICLE_SELECTOR);
    return article &&
      !article.closest(STORY_SELECTOR) &&
      !article.querySelector(STORY_SELECTOR) &&
      isFeedStory(article)
      ? article
      : null;
  }

  function belongsToStory(element, story) {
    return closestStory(element) === story;
  }

  function intersectsViewport(element) {
    const rectangle = element?.getBoundingClientRect?.();
    if (!hasPositiveRect(rectangle)) {
      return false;
    }
    const viewportWidth = Math.max(
      Number(document.documentElement?.clientWidth || 0),
      Number(window.innerWidth || 0)
    );
    const viewportHeight = Math.max(
      Number(document.documentElement?.clientHeight || 0),
      Number(window.innerHeight || 0)
    );
    return (
      rectangle.bottom > 0 &&
      rectangle.right > 0 &&
      rectangle.top < viewportHeight &&
      rectangle.left < viewportWidth
    );
  }

  /*
   * Current Facebook layouts can give an aria-posinset wrapper a zero-size or
   * displaced rectangle while its owned article is visibly on screen.
   * Discovery still selects that lifecycle owner so one post has one state
   * record. Admit it through a bounded visible semantic descendant only when
   * that descendant resolves back to the same story. Viewport cohorts are
   * refreshed only at explicit lifecycle/viewport boundaries, so a card pulled
   * upward solely by an earlier hide still cannot start an automatic cascade.
   */
  function intersectsStoryViewport(story) {
    if (intersectsViewport(story)) {
      return true;
    }
    const geometryCandidates = Array.from(
      story?.querySelectorAll?.(STORY_GEOMETRY_FALLBACK_SELECTOR) || []
    ).slice(0, 24);
    for (const candidate of geometryCandidates) {
      if (
        closestStory(candidate) !== story ||
        !intersectsViewport(candidate)
      ) {
        continue;
      }
      if (!fallbackGeometryStories.has(story)) {
        fallbackGeometryStories.add(story);
        counters.storyGeometryFallbackAdmissions += 1;
      }
      return true;
    }
    return false;
  }

  function observeStory(story) {
    if (observedStories.has(story)) {
      return;
    }
    observedStories.add(story);
    counters.storiesObserved += 1;
    intersectionObserver?.observe(story);
  }

  function clearRecycledOffscreenMatch(story) {
    if (!story.dataset.fffcKind) {
      return;
    }
    const previous = storyState.get(story);
    const signature = storySignature(story);
    if (previous?.record && previous.signature !== signature) {
      clearMatch(story);
      counters.clearedRecycledMatches += 1;
      storyState.set(story, {
        signature,
        record: null,
        misses: 0,
        firstSeen: performance.now(),
        lastSeenPass: reconciliationPass
      });
    }
  }

  function queueStory(story, _reason) {
    if (!story?.isConnected || !isFeedStory(story)) {
      return;
    }
    observeStory(story);
    if (!viewportStoryCohort.has(story)) {
      if (!deferredOffscreenStories.has(story)) {
        deferredOffscreenStories.add(story);
        counters.offscreenStoriesDeferred += 1;
      }
      if (String(_reason).startsWith("mutation")) {
        clearRecycledOffscreenMatch(story);
      }
      return;
    }
    deferredOffscreenStories.delete(story);
    queue.add(story);
    counters.queueHighWater = Math.max(counters.queueHighWater, queue.size);
    scheduleQueue();
  }

  function queueNode(node, reason) {
    const element =
      node instanceof Element ? node : node?.parentElement || null;
    if (!element) {
      return;
    }
    const story = closestStory(element);
    if (story) {
      queueStory(story, reason);
    }
    for (const candidate of
      element.querySelectorAll?.(
        `${STORY_SELECTOR},${ARTICLE_SELECTOR}`
      ) || []) {
      queueStory(closestStory(candidate), reason);
    }
    scheduleAuxiliaryScan();
  }

  function discoverStories() {
    const stories = storyCandidates();
    counters.storyCandidatesSeen += stories.length;
    counters.orphanArticleCandidatesSeen += stories.filter(
      (story) =>
        story.matches?.(ARTICLE_SELECTOR) &&
        !story.matches?.(STORY_SELECTOR)
    ).length;
    for (const story of stories) {
      observeStory(story);
    }
    return stories;
  }

  /*
   * Freeze the stories that are actually visible when the page opens or the
   * user scrolls. Hiding one card can pull the next off-screen card upward;
   * that layout shift must not start an automatic hide cascade.
   */
  function refreshViewportStories(reason) {
    const stories = discoverStories();
    viewportStoryCohort.clear();
    counters.viewportCohortRefreshes += 1;
    for (const story of stories) {
      if (intersectsStoryViewport(story)) {
        viewportStoryCohort.add(story);
      }
    }
    for (const story of viewportStoryCohort) {
      queueStory(story, reason);
    }
  }

  function queueViewportStories(reason) {
    discoverStories();
    for (const story of Array.from(viewportStoryCohort)) {
      if (!story.isConnected) {
        viewportStoryCohort.delete(story);
        continue;
      }
      queueStory(story, reason);
    }
  }

  function drainQueue(source) {
    counters.queueFlushes += 1;
    if (source === "timer-fallback") {
      counters.queueFallbackFlushes += 1;
    }
    const stories = Array.from(queue);
    queue.clear();
    for (const story of stories) {
      scanStory(story);
    }
  }

  function scheduleQueue() {
    if (scanFrame !== null || scanFallbackTimer !== null) {
      return;
    }
    if (typeof requestAnimationFrame === "function") {
      scanFrame = requestAnimationFrame(() => {
        scanFrame = null;
        if (scanFallbackTimer !== null) {
          window.clearTimeout(scanFallbackTimer);
          scanFallbackTimer = null;
        }
        drainQueue("animation-frame");
      });
      /*
       * Chromium can throttle requestAnimationFrame during tab/popup
       * transitions. Do not leave newly discovered stories stranded in the
       * queue if the frame callback is delayed.
       */
      scanFallbackTimer = window.setTimeout(() => {
        scanFallbackTimer = null;
        if (scanFrame !== null) {
          if (typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(scanFrame);
          }
          scanFrame = null;
        }
        drainQueue("timer-fallback");
      }, 140);
      return;
    }
    scanFallbackTimer = window.setTimeout(() => {
      scanFallbackTimer = null;
      drainQueue("timer");
    }, 16);
  }

  function scheduleViewportRescan(reason) {
    if (viewportRescanTimer !== null) {
      return;
    }
    viewportRescanTimer = window.setTimeout(() => {
      viewportRescanTimer = null;
      counters.viewportRescans += 1;
      refreshViewportStories(reason);
      scheduleAuxiliaryScan(true);
    }, 220);
  }

  function scheduleAuxiliaryScan(admitVisible = false) {
    auxiliaryAdmitVisible ||= admitVisible;
    if (auxiliaryScanTimer !== null) {
      return;
    }
    auxiliaryScanTimer = window.setTimeout(() => {
      auxiliaryScanTimer = null;
      const shouldAdmitVisible = auxiliaryAdmitVisible;
      auxiliaryAdmitVisible = false;
      scanRightRail();
      scanSuggestionModules(shouldAdmitVisible);
      scanReelModules(shouldAdmitVisible);
      scanStoriesTray(shouldAdmitVisible);
      scanMarketplace(shouldAdmitVisible);
    }, 100);
  }

  function hiddenByAncestors(element, boundary) {
    let current = element;
    const stop = boundary?.parentElement || null;
    while (current && current !== stop) {
      if (
        current.hidden ||
        current.getAttribute?.("aria-hidden") === "true"
      ) {
        return true;
      }
      const style = window.getComputedStyle?.(current);
      if (
        style &&
        (style.display === "none" ||
          style.visibility === "hidden" ||
          style.visibility === "collapse" ||
          Number.parseFloat(style.opacity || "1") <= 0.01 ||
          Number.parseFloat(style.fontSize || "16") <= 0)
      ) {
        return true;
      }
      if (current === boundary) {
        break;
      }
      current = current.parentElement;
    }
    return false;
  }

  function appearsBefore(left, right) {
    if (!left || !right || left === right) {
      return false;
    }
    return Boolean(
      left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  }

  function headerBoundary(story) {
    return story.querySelector(
      "[data-ad-rendering-role='story_message']," +
        "video,img[src],[data-ad-rendering-role='title']"
    );
  }

  function isHeaderGeometry(story, element) {
    /*
     * closestStory() resolution can disagree between sibling elements in
     * Reels-format cards that lack aria-posinset (the header/name/disclosure
     * row and the reel media can resolve to different role='article'
     * ancestors, or the header row to none at all). story is already a
     * validated boundary from storyCandidates(), so plain DOM containment is
     * an acceptable fallback when the heuristic ownership check fails.
     */
    if (!belongsToStory(element, story) && !story.contains(element)) {
      return false;
    }
    if (element.closest(HEADER_EXCLUSIONS)) {
      return false;
    }

    const storyRect = story.getBoundingClientRect?.();
    const elementRect = element.getBoundingClientRect?.();
    if (
      hasPositiveRect(storyRect) &&
      intersectsViewport(story) &&
      hasPositiveRect(elementRect)
    ) {
      const headerBottom =
        storyRect.top +
        Math.min(230, Math.max(115, storyRect.height * 0.28));
      return (
        elementRect.top >= storyRect.top - 4 &&
        elementRect.top <= headerBottom &&
        elementRect.left >= storyRect.left - 8 &&
        elementRect.right <= storyRect.right + 8
      );
    }

    const boundary = headerBoundary(story);
    return !boundary || appearsBefore(element, boundary);
  }

  function directTextNodes(element) {
    return Array.from(element?.childNodes || [])
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.nodeValue || "")
      .join("");
  }

  function valueCandidates(element, includeTextContent = false) {
    const values = [
      element?.innerText,
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title")
    ];
    if (includeTextContent) {
      values.push(element?.textContent);
    }
    return values.map(core.normalizeText).filter(Boolean);
  }

  function directAdLabel(element) {
    return (
      valueCandidates(element, true).find(core.matchesAdDisclosureLabel) ||
      null
    );
  }

  /*
   * Read the small tokens Chromium actually laid out in the post header.
   * Facebook's Mac layout can render Ad/Follow in ordinary span/div elements
   * that carry none of the link, button or flex markers used by the structural
   * decoders. Exact matching, positive on-screen geometry, story ownership and
   * the existing header boundary keep this separate from body-text searching.
   */
  function renderedHeaderToken(story, matches) {
    const elements = Array.from(
      story.querySelectorAll("span,div")
    ).slice(0, 260);
    for (const element of elements) {
      if (
        !isHeaderGeometry(story, element) ||
        hiddenByAncestors(element, story) ||
        !intersectsViewport(element)
      ) {
        continue;
      }
      counters.renderedHeaderTextCandidates += 1;
      const values = [directTextNodes(element), element.innerText];
      if (element.children.length === 0) {
        values.push(element.textContent);
      }
      for (const value of new Set(
        values.map(core.normalizeText).filter(Boolean)
      )) {
        if (value.length <= 24 && matches(value, element)) {
          counters.renderedHeaderTokenMatches += 1;
          return { element, value };
        }
      }
    }
    return null;
  }

  function paidForByDisclosureLabel(element, story) {
    if (hiddenByAncestors(element, story)) {
      return null;
    }
    const children = Array.from(element?.children || []);
    for (let index = 0; index < children.length - 1; index += 1) {
      const first = children[index];
      const second = children[index + 1];
      if (
        first.tagName !== "SPAN" ||
        second.tagName !== "SPAN" ||
        hiddenByAncestors(first, element) ||
        hiddenByAncestors(second, element)
      ) {
        continue;
      }
      const firstText = core.normalizeText(first.textContent);
      const secondText = core.normalizeText(second.textContent);
      if (
        /^sponsored\s*[·•]\s*$/i.test(firstText) &&
        /^paid for by\s+\S/i.test(secondText) &&
        core.matchesPaidForByDisclosure(`${firstText} ${secondText}`)
      ) {
        return "Sponsored";
      }
    }
    return null;
  }

  /*
   * Fallback for the "Sponsored · Paid for by X" disclosure that does not
   * depend on the exact two-adjacent-span-children shape paidForByDisclosureLabel
   * requires. Bounded by the same 25-240 char / exact-regex validation in
   * core.matchesPaidForByDisclosure, so it only widens *which DOM shapes*
   * qualify, not what text qualifies.
   */
  function paidForByTextFallback(element, story) {
    if (hiddenByAncestors(element, story)) {
      return null;
    }
    const text = core.normalizeText(element.textContent);
    return core.matchesPaidForByDisclosure(text) ? "Sponsored" : null;
  }

  function intersects(rectangle, boundary) {
    return (
      rectangle.right >= boundary.left - 2 &&
      rectangle.left <= boundary.right + 2 &&
      rectangle.bottom >= boundary.top - 2 &&
      rectangle.top <= boundary.bottom + 2
    );
  }

  /*
   * The single bounded fallback reconstructs CSS-ordered glyphs. It accepts
   * only an exact rendered advertising disclosure, not broad letter counts.
   */
  function glyphRecordsFor(container) {
    const containerRect = container.getBoundingClientRect?.();
    if (!hasPositiveRect(containerRect)) {
      return [];
    }
    const records = [];
    const leaves = Array.from(container.querySelectorAll("span,div")).slice(
      0,
      180
    );
    for (const element of leaves) {
      if (element.children.length > 0) {
        continue;
      }
      const text = directTextNodes(element);
      if (
        !text ||
        text.length > 3 ||
        hiddenByAncestors(element, container)
      ) {
        continue;
      }
      const style = window.getComputedStyle?.(element);
      if (style?.position === "absolute" || style?.position === "fixed") {
        continue;
      }
      const order = Number.parseFloat(style?.order);
      for (const rectangle of element.getClientRects?.() || []) {
        if (
          !hasPositiveRect(rectangle) ||
          !intersects(rectangle, containerRect)
        ) {
          continue;
        }
        records.push({
          text,
          left: rectangle.left,
          top: rectangle.top,
          order: Number.isFinite(order) ? order : null,
          visible: true
        });
        break;
      }
      if (records.length > 40) {
        break;
      }
    }
    return records;
  }

  function hasScrambledLabelStructure(container) {
    const descendants = Array.from(
      container.querySelectorAll("span,div")
    ).slice(0, 100);
    return descendants.some((element) => {
      /*
       * Current captures contain 60 one-glyph children. Keep this bounded,
       * but do not reject the real layout merely because Facebook padded it
       * with decoys.
       */
      if (element.children.length < 2 || element.children.length > 96) {
        return false;
      }
      const style = window.getComputedStyle?.(element);
      const inline = element.getAttribute?.("style") || "";
      return (
        style?.display === "flex" ||
        /display\s*:\s*flex/i.test(inline) ||
        Array.from(element.children).some((child) =>
          /(?:^|;)\s*order\s*:/i.test(child.getAttribute?.("style") || "")
        )
      );
    });
  }

  function labelledReferenceLabel(element) {
    const labelledBy = core.normalizeText(
      element.getAttribute?.("aria-labelledby")
    );
    if (!labelledBy) {
      return null;
    }
    for (const id of labelledBy.split(/\s+/)) {
      const target = document.getElementById(id);
      if (!target) {
        continue;
      }
      const direct = directAdLabel(target);
      if (direct) {
        return direct;
      }
      if (hasScrambledLabelStructure(target)) {
        const decoded = core.decodeExactAdLabel(glyphRecordsFor(target));
        if (decoded) {
          return decoded;
        }
      }
    }
    return null;
  }

  // SVG references qualify only when their text is an exact disclosure.
  function referencedSvgLabel(container) {
    const values = [];
    for (const text of container.querySelectorAll("svg text")) {
      values.push(text.textContent);
    }
    for (const use of container.querySelectorAll("use")) {
      const reference =
        use.getAttribute("href") || use.getAttribute("xlink:href") || "";
      if (!reference.startsWith("#")) {
        continue;
      }
      const target = document.getElementById(reference.slice(1));
      if (target) {
        values.push(
          target.textContent,
          target.nextSibling?.textContent,
          target.nextElementSibling?.textContent
        );
      }
    }
    return (
      values.map(core.normalizeText).find(core.matchesAdDisclosureLabel) ||
      null
    );
  }

  function disclosureDestinations(element) {
    return [
      element.href,
      element.getAttribute?.("href"),
      element.getAttribute?.("data-lynx-uri")
    ];
  }

  function decodeAdCandidate(element, story = null) {
    counters.headerCandidatesChecked += 1;
    if (element.closest?.("object")) {
      counters.nestedObjectCandidates += 1;
    }

    /*
     * The destination proves that this is advertising, but it does not say
     * whether Facebook rendered "Ad" or "Sponsored". Record the evidence now,
     * reconstruct the visible disclosure below, and use the URL as the final
     * 100%-confidence fallback.
     */
    const hasDisclosureDestination =
      disclosureDestinations(element).some(core.matchesAdDisclosureUrl);
    if (hasDisclosureDestination) {
      counters.disclosureLinkMatches += 1;
    }

    const paidForBy = story
      ? paidForByDisclosureLabel(element, story) ||
        paidForByTextFallback(element, story)
      : null;
    if (paidForBy) {
      counters.paidForByDisclosureMatches += 1;
      return {
        kind: "sponsored",
        label: paidForBy,
        source: "visible-paid-for-by-disclosure",
        reason: "rendered-paid-for-by-disclosure",
        confidence: 0.99
      };
    }

    const direct = directAdLabel(element);
    if (direct) {
      counters.directAdLabelMatches += 1;
      return {
        kind: core.adKindForLabel(direct),
        label: direct,
        source: "visible-header-label",
        reason: "rendered-ad-label",
        confidence: 0.99
      };
    }

    const referenced = labelledReferenceLabel(element);
    if (referenced) {
      counters.labelledReferenceMatches += 1;
      return {
        kind: core.adKindForLabel(referenced),
        label: referenced,
        source: "aria-labelledby-ad-label",
        reason: "rendered-ad-label",
        confidence: 0.99
      };
    }

    const svg = referencedSvgLabel(element);
    if (svg) {
      counters.svgLabelMatches += 1;
      return {
        kind: core.adKindForLabel(svg),
        label: svg,
        source: "referenced-svg-label",
        reason: "rendered-ad-label",
        confidence: 0.99
      };
    }

    if (element.querySelector?.("canvas")) {
      counters.canvasHeaderCandidates += 1;
    }

    if (hasScrambledLabelStructure(element)) {
      counters.scrambledHeaderCandidates += 1;
      const decoded = core.decodeExactAdLabel(glyphRecordsFor(element));
      if (decoded) {
        counters.glyphDecodeMatches += 1;
        return {
          kind: core.adKindForLabel(decoded),
          label: decoded,
          source: element.closest?.("object")
            ? "nested-object-glyph-order"
            : "rendered-glyph-order",
          reason: "rendered-ad-label",
          confidence: 0.99
        };
      }
      counters.rawDecoyStringsRejected += 1;
    }

    if (hasDisclosureDestination) {
      return {
        kind: "ad",
        label: "Ad",
        source: "facebook-ad-disclosure-link",
        reason: "advertising-disclosure-link",
        confidence: 1
      };
    }
    return null;
  }

  function adHeaderCandidates(story) {
    const result = [];
    const seen = new Set();
    for (const element of story.querySelectorAll(
      "a,[aria-labelledby],object,span[style*='display: flex']," +
        "span[style*='display:flex'],div[style*='display: flex']," +
        "div[style*='display:flex'],[role='button'],svg,canvas"
    )) {
      if (!seen.has(element) && isHeaderGeometry(story, element)) {
        seen.add(element);
        result.push(element);
      }
    }
    return result;
  }

  // The wider audit (see AUDIT.md) correctly rejected counting arbitrary
  // data-ad-rendering-role attributes: most values (profile_name, title,
  // story_message, ...) also appear on ordinary posts, since Facebook renders
  // both through the same component family. The cta- prefix is narrower -
  // Facebook only attaches it to a paid placement's own Shop Now/Learn More
  // button, which ordinary posts never render. Checked against 76 posts
  // across several accounts (organic Page posts and personal posts included)
  // with zero false positives, so it's kept as its own signal rather than
  // folded into the generic attribute-count check the audit ruled out.
  function ctaButtonAdSignal(story) {
    if (!story.querySelector("[data-ad-rendering-role^='cta']")) {
      return null;
    }
    /*
     * Facebook's ad-rendering-role component family (cta-, profile_name,
     * story_message, like_button, comment_button) is not ad-exclusive after
     * all - a followed Page's own post can render through the same
     * component inside a joined group (live capture 2026-08-13: "J&F
     * Pressure Cleaning" post, Send Message CTA, zero Sponsored disclosure
     * anywhere, hasGroupOrigin true). Reuse the same group-origin guard
     * suggestionHeaderAction already applies to Follow so a real in-group ad
     * still falls through to the text-disclosure detectors below, which
     * Meta's policy requires every paid placement to render regardless.
     */
    if (hasGroupOrigin(story)) {
      counters.ctaButtonGroupOriginProtections += 1;
      return null;
    }
    counters.ctaButtonMarkerMatches += 1;
    return {
      kind: "sponsored",
      label: "Sponsored",
      source: "cta-button-marker",
      reason: "ad-cta-button-rendering-role",
      confidence: 1
    };
  }

  function findAdSignal(story) {
    const ctaMarker = ctaButtonAdSignal(story);
    if (ctaMarker) {
      return ctaMarker;
    }
    const rendered = renderedHeaderToken(
      story,
      (value, element) => {
        const excludedByHeading = Boolean(
          element.closest(
            "h1,h2,h3,h4,h5,[role='heading']," +
              "[data-ad-rendering-role='profile_name']"
          )
        );
        const labelMatches = core.matchesAdDisclosureLabel(value);
        if (labelMatches && excludedByHeading) {
          counters.adLabelExcludedByHeadingAncestor += 1;
        }
        return !excludedByHeading && labelMatches;
      }
    );
    if (rendered) {
      counters.directAdLabelMatches += 1;
      return {
        kind: core.adKindForLabel(rendered.value),
        label: core.normalizeDisclosureLabel(rendered.value) === "ad"
          ? "Ad"
          : "Sponsored",
        source: "visible-rendered-header-token",
        reason: "rendered-ad-label",
        confidence: 0.99
      };
    }
    for (const candidate of adHeaderCandidates(story)) {
      const signal = decodeAdCandidate(candidate, story);
      if (signal) {
        return signal;
      }
    }
    return null;
  }

  /*
   * Meta's "AI info"/"AI content" disclosure renders as plain byline text
   * next to the timestamp - same rendering slot renderedHeaderToken already
   * scans for Ad labels, so no new DOM-walking is needed, just a different
   * label set. Opt-in and off by default like the activity filters: this
   * hasn't had the live-capture verification the other detectors have.
   */
  function aiContentSignal(story) {
    if (!settings.filterAiContent) {
      return null;
    }
    const rendered = renderedHeaderToken(story, (value) =>
      core.matchesAiContentLabel(value)
    );
    if (!rendered) {
      return null;
    }
    counters.aiContentMatches += 1;
    return {
      kind: "ai-content",
      label: "AI content",
      source: "rendered-header-token",
      reason: "ai-content-label",
      confidence: 0.95
    };
  }

  function exactSuggestionLabel(story) {
    for (const element of story.querySelectorAll(
      "h2,h3,h4,h5,[role='heading'],a[role='link'],span[dir='auto']"
    )) {
      if (!belongsToStory(element, story) && !story.contains(element)) {
        continue;
      }
      for (const value of valueCandidates(element, true)) {
        if (value.length <= 100 && core.matchesSuggestionLabel(value)) {
          return value;
        }
      }
    }

    /*
     * "Suggested for you" can render in the byline row - next to the · dot
     * and timestamp - as a bare span with no dir attribute and outside every
     * heading (2026-07-31 live capture, Vivaldi). None of the tags/attributes
     * above match that element. Fall back to the same header-geometry gate
     * renderedHeaderToken already uses for the equivalent Ad-label problem,
     * rather than widening the primary selector to every span/div in the
     * story and risking a match against ordinary post text.
     */
    const headerElements = Array.from(
      story.querySelectorAll("span,div")
    ).slice(0, 260);
    for (const element of headerElements) {
      if (
        !isHeaderGeometry(story, element) ||
        hiddenByAncestors(element, story)
      ) {
        continue;
      }
      for (const value of valueCandidates(element, true)) {
        if (value.length <= 100 && core.matchesSuggestionLabel(value)) {
          return value;
        }
      }
    }
    return null;
  }

  function suggestionFeedbackPair(story) {
    const exactActions = [];
    for (const element of story.querySelectorAll(
      "button,[role='button'],[aria-label],[role='menuitem']"
    )) {
      for (const value of valueCandidates(element, true)) {
        if (core.suggestionActionKind(value)) {
          exactActions.push(value);
        }
      }
    }
    if (core.hasSuggestionFeedbackPair(exactActions)) {
      return true;
    }

    // Facebook may pre-render these two recommendation actions inside a
    // hidden, post-local menu. Their paired presence is semantic evidence;
    // neither phrase alone qualifies.
    const text = core
      .normalizeText(story.textContent)
      .toLowerCase()
      .replace(/not interested/g, "NOT_INTERESTED");
    return text.includes("NOT_INTERESTED") && /\binterested\b/.test(text);
  }

  /*
   * Suggested posts can expose an upper-header Follow/Join action. Advertising
   * runs first so an advert carrying Follow is never misclassified.
   */
  function suggestionHeaderAction(story) {
    for (const element of story.querySelectorAll(
      "a,button,[role='button'],[role='link'],span[dir='auto']"
    )) {
      if (!isHeaderGeometry(story, element)) {
        continue;
      }
      for (const value of valueCandidates(element, true)) {
        const action = core.suggestionActionKind(value);
        if (action === "follow" || action === "join") {
          return { label: action === "follow" ? "Follow" : "Join", element };
        }
      }
    }

    const rendered = renderedHeaderToken(story, (value, element) => {
      const action = core.suggestionActionKind(value);
      const matches = action === "follow" || action === "join";
      if (
        matches &&
        element.closest(
          "h1,h2,h3,h4,h5,[role='heading']," +
            "[data-ad-rendering-role='profile_name']"
        )
      ) {
        counters.suggestionActionExcludedByHeadingAncestor += 1;
      }
      return matches;
    });
    if (rendered) {
      const action = core.suggestionActionKind(rendered.value);
      return {
        label: action === "follow" ? "Follow" : "Join",
        element: rendered.element
      };
    }

    const header = story.querySelector("h2,h3,h4,h5,[role='heading']");
    const text = core.normalizeText(header?.innerText || header?.textContent);
    const match = text.match(/[·•]\s*(follow|join(?: group)?)\b/i);
    return match ? { label: match[1], element: header } : null;
  }

  /*
   * A dismiss control is recommendation evidence only when Facebook names the
   * recommendation in the accessibility label. `Hide post by …` is deliberately
   * returned as ambiguous: July 2026 captures show that exact control on
   * ordinary friend/followed-account posts as well as promotional posts.
   */
  function suggestionDismissControl(story) {
    const storyRect = story.getBoundingClientRect?.();
    if (!hasPositiveRect(storyRect)) {
      return null;
    }
    for (const element of story.querySelectorAll(
      "button,[role='button'][aria-label],[role='link'][aria-label]"
    )) {
      const elementRect = element.getBoundingClientRect?.();
      if (
        !hasPositiveRect(elementRect) ||
        !isHeaderGeometry(story, element) ||
        elementRect.width > 86 ||
        elementRect.height > 86 ||
        elementRect.right < storyRect.right - Math.min(190, storyRect.width * 0.3)
      ) {
        continue;
      }
      for (const value of valueCandidates(element, true)) {
        if (
          /^(?:hide|remove|dismiss) (?:this )?(?:suggestion|recommendation)$/i.test(
            value
          )
        ) {
          return { label: value, decisive: true };
        }
        if (/^hide post(?: by .+)?$/i.test(value)) {
          return { label: value, decisive: false };
        }
      }
    }
    return null;
  }

  function hasGroupOrigin(story) {
    for (const link of story.querySelectorAll("a[href]")) {
      if (
        (belongsToStory(link, story) || story.contains(link)) &&
        isHeaderGeometry(story, link) &&
        core.isFacebookGroupStoryHref(link.getAttribute("href"))
      ) {
        return true;
      }
    }
    return false;
  }

  /*
   * Facebook wraps the same actor's avatar and name in two separate links
   * with unrelated hrefs - a live capture (2026-08-04) showed the avatar
   * linking to a Story deep-link (/stories/...) while the name links to
   * the profile (/PageName). So href can't be used to test "same actor".
   * The avatar's aria-label is "{Name}, view story" (or "{Name}'s profile
   * picture"); stripping that known suffix and comparing to the name
   * link's visible text is reliable instead.
   */
  function actorNameText(link) {
    const label = core.normalizeText(link.getAttribute("aria-label"));
    if (label) {
      return label
        .replace(/,?\s*view story$/i, "")
        .replace(/'s profile picture$/i, "")
        .replace(/,?\s*profile picture$/i, "")
        .trim();
    }
    const text = core.normalizeText(link.innerText || link.textContent);
    return text || null;
  }

  /*
   * Facebook tags a check-in/location with connector text right before its
   * own link, e.g. "{Name} is in {Location}." or "{Name} is at {Place}." -
   * that location link sits between the actor's name and the Follow
   * button, so hasForeignActorBeforeAction below would otherwise misread
   * it as a second, different actor (live capture 2026-08-04: "Australia/
   * NZ Crime TV is in Russell Island, QLD"). Add newly-spotted phrasings
   * here as they're found - each one only excludes the link immediately
   * following it, never the actor's own name link.
   */
  const CHECKIN_CONNECTOR_PHRASES = Object.freeze(["is in", "is at"]);

  function isCheckinLocationLink(link) {
    const container = link.closest("b") || link;
    const text = core.normalizeText(
      container.previousSibling?.textContent ||
        container.previousSibling?.nodeValue
    );
    return CHECKIN_CONNECTOR_PHRASES.some((phrase) =>
      new RegExp(`\\b${phrase}\\s*$`, "i").test(text)
    );
  }

  /*
   * A friend sharing someone else's post/reel nests the original creator's
   * own header - including their own Follow/Join button - inside the
   * friend's story. isHeaderGeometry only checks vertical position, so
   * that nested button still reads as "in the header": it belongs to the
   * embedded creator, not the story's own author, and must not turn the
   * friend's share into Suggested. actors is in document order, so the
   * last one that precedes actionElement is whichever post-header it
   * actually belongs to.
   */
  function hasForeignActorBeforeAction(story, actionElement) {
    if (!actionElement) {
      return false;
    }
    const actors = Array.from(
      story.querySelectorAll(
        "a[role='link'][aria-label],a[role='link'][href]"
      )
    ).filter(
      (link) => isHeaderGeometry(story, link) && !isCheckinLocationLink(link)
    );
    if (actors.length < 2) {
      return false;
    }
    const primary = actors[0];
    let nearest = null;
    for (const actor of actors) {
      if (
        actor.compareDocumentPosition(actionElement) &
        Node.DOCUMENT_POSITION_FOLLOWING
      ) {
        nearest = actor;
      } else {
        break;
      }
    }
    if (!nearest || nearest === primary) {
      return false;
    }
    const primaryName = actorNameText(primary);
    const nearestName = actorNameText(nearest);
    return Boolean(
      primaryName &&
        nearestName &&
        primaryName.toLowerCase() !== nearestName.toLowerCase()
    );
  }

  // Best-effort entity name for the debug/collapse label, e.g. the Page,
  // Group or person Facebook is suggesting. Reuses the same actor-link
  // heuristic storySignature() already relies on for identity; a miss here
  // just means the label falls back to the action alone.
  function suggestionTitle(story) {
    const profileName = story.querySelector(
      "[data-ad-rendering-role='profile_name']"
    );
    const profileText = core.normalizeText(
      profileName?.innerText || profileName?.textContent
    );
    if (profileText) {
      return profileText;
    }
    const actor = story.querySelector(
      "a[role='link'][aria-label],a[role='link'][href]"
    );
    const actorText = core.normalizeText(
      actor?.getAttribute("aria-label") || actor?.textContent
    );
    return actorText || null;
  }

  function findSuggestionSignal(story) {
    const label = exactSuggestionLabel(story);
    if (label) {
      if (!settings[core.suggestedSubcategoryKey("exact-suggestion-label", label)]) {
        return null;
      }
      counters.suggestionLabelMatches += 1;
      return {
        kind: "suggested",
        label,
        title: suggestionTitle(story),
        source: "exact-suggestion-label",
        reason: "exact-suggestion-label",
        confidence: 0.97
      };
    }

    if (suggestionFeedbackPair(story)) {
      if (!settings.filterSuggestedOther) {
        return null;
      }
      counters.recommendationPairMatches += 1;
      return {
        kind: "suggested",
        label: "Interested + Not interested",
        title: suggestionTitle(story),
        source: "post-local-recommendation-actions",
        reason: "suggested-interest-actions",
        confidence: 0.98
      };
    }

    const headerAction = suggestionHeaderAction(story);
    if (headerAction) {
      const actionKind = core.suggestionActionKind(headerAction.label);
      /*
       * A normal post from a joined Group can expose Follow for its author.
       * Join remains explicit recommendation evidence, but Follow alone must
       * not turn an existing Group post into Suggested.
       */
      if (actionKind === "follow" && hasGroupOrigin(story)) {
        counters.groupOriginProtections += 1;
        return null;
      }
      /*
       * Same reasoning as hasGroupOrigin above: Join is unambiguous
       * recommendation evidence on its own, so the nested/embedded actor
       * check is only needed to protect Follow from friend-share false
       * positives, not to second-guess Join.
       */
      if (
        actionKind === "follow" &&
        hasForeignActorBeforeAction(story, headerAction.element)
      ) {
        counters.foreignActorProtections += 1;
        return null;
      }
      const reason =
        actionKind === "follow"
          ? "suggested-header-follow"
          : "suggested-header-join";
      if (!settings[core.suggestedSubcategoryKey(reason, headerAction.label)]) {
        return null;
      }
      counters.suggestionHeaderActionMatches += 1;
      return {
        kind: "suggested",
        label: headerAction.label,
        title: suggestionTitle(story),
        source: "header-action",
        reason,
        confidence: 0.95
      };
    }

    const dismissAction = suggestionDismissControl(story);
    if (dismissAction) {
      if (!dismissAction.decisive) {
        counters.ambiguousDismissControlsRejected += 1;
        return null;
      }
      if (!settings.filterSuggestedOther) {
        return null;
      }
      counters.suggestionDismissControlMatches += 1;
      return {
        kind: "suggested",
        label: dismissAction.label,
        title: suggestionTitle(story),
        source: "exact-suggestion-dismiss-control",
        reason: "suggested-dismiss-control",
        confidence: 0.98
      };
    }
    return null;
  }

  /*
   * productsOnly widens the search to the whole story instead of just its
   * headings: Facebook's "Products shown" unit is typically a caption below
   * the media, not a heading element, so the heading-only text used for the
   * other six rules misses it entirely.
   */
  function feedEventText(story, productsOnly = false) {
    if (productsOnly) {
      return core.normalizeText(story.innerText || story.textContent);
    }
    const values = [];
    for (const heading of story.querySelectorAll(
      "h2,h3,h4,h5,[role='heading']"
    )) {
      if (belongsToStory(heading, story)) {
        values.push(heading.innerText, heading.textContent);
      }
    }
    const storyText = core.normalizeText(story.innerText || story.textContent);
    if (storyText.includes("·")) {
      values.push(storyText.split("·")[0]);
    }
    return core.normalizeText(values.filter(Boolean).join(" "));
  }

  function activitySignal(story) {
    const active = Object.entries(ACTIVITY_KIND_SETTINGS).some(
      ([, setting]) => settings[setting]
    );
    if (!active) {
      return null;
    }

    if (
      settings.filterAppGame &&
      story.querySelector(
        "a[href*='/games/?app_id='],a[href*='/instantgames/play']," +
          "a[href*='/games/quicksilver/']"
      )
    ) {
      return {
        kind: "app-game",
        setting: "filterAppGame",
        reason: "feed-app-game",
        confidence: 0.98
      };
    }

    if (settings.filterProductsShown) {
      const productMatch = core.classifyFeedEvent(
        feedEventText(story, true)
      );
      if (
        productMatch?.kind === "products-shown" &&
        settings[productMatch.setting]
      ) {
        return productMatch;
      }
    }

    const match = core.classifyFeedEvent(feedEventText(story));
    return match && settings[match.setting] ? match : null;
  }

  function findReelStorySignal(story) {
    for (const link of story.querySelectorAll("a[href]")) {
      if (
        belongsToStory(link, story) &&
        core.matchesFacebookReelUrl(link.getAttribute("href"))
      ) {
        return {
          kind: "reel",
          label: "Reel",
          source: "exact-facebook-reel-url",
          reason: "reel-story",
          confidence: 0.99
        };
      }
    }
    return null;
  }

  function customWordCandidateText(element, story) {
    if (
      (!belongsToStory(element, story) && !story.contains(element)) ||
      element.closest(
        "button,[role='button'],[role='menu'],[role='menuitem']," +
          "[aria-hidden='true'],.fffc-reveal-control"
      ) ||
      hiddenByAncestors(element, story)
    ) {
      return "";
    }

    const storyRect = story.getBoundingClientRect?.();
    const fragments = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT
    );
    let visited = 0;
    let node = walker.nextNode();
    while (node && visited < 240 && fragments.join(" ").length < 4000) {
      visited += 1;
      const parent = node.parentElement;
      const value = core.normalizeText(node.nodeValue);
      if (!parent || !value || hiddenByAncestors(parent, element)) {
        node = walker.nextNode();
        continue;
      }
      const style = window.getComputedStyle?.(parent);
      if (style?.position === "absolute" || style?.position === "fixed") {
        node = walker.nextNode();
        continue;
      }
      const rectangle = parent.getBoundingClientRect?.();
      if (
        hasPositiveRect(storyRect) &&
        hasPositiveRect(rectangle) &&
        !intersects(rectangle, storyRect)
      ) {
        node = walker.nextNode();
        continue;
      }
      fragments.push(value);
      node = walker.nextNode();
    }
    return core.normalizeText(fragments.join(" ")).slice(0, 4000);
  }

  /*
   * Word rules inspect only visible author, story-message and link-preview
   * fields. Hidden menus, URLs, accessibility labels and decoy glyphs are
   * excluded so a user term cannot be triggered by Facebook internals.
   */
  function customWordFilterSignal(story) {
    if (!settings.enableWordFilters || !settings.customWordFilters.length) {
      return null;
    }

    const candidates = [];
    const seen = new Set();
    for (const element of story.querySelectorAll(
      "a[role='link'][href]," +
        "[data-ad-rendering-role='story_message']," +
        "[data-ad-rendering-role='title']," +
        "[data-ad-rendering-role='description']"
    )) {
      const inHeader =
        element.matches("a[role='link'][href]") &&
        isHeaderGeometry(story, element);
      const semanticText = element.hasAttribute("data-ad-rendering-role");
      if ((!inHeader && !semanticText) || seen.has(element)) {
        continue;
      }
      seen.add(element);
      const text = customWordCandidateText(element, story);
      if (text) {
        candidates.push(text);
      }
    }

    counters.customWordFilterCandidates += candidates.length;
    for (const text of candidates) {
      const term = core.matchCustomWordFilter(
        text,
        settings.customWordFilters
      );
      if (!term) {
        continue;
      }
      counters.customWordFilterMatches += 1;
      return {
        kind: "word-filter",
        label: `Custom word: ${term}`,
        source: "visible-post-text",
        reason: "custom-word-filter",
        confidence: 1
      };
    }
    return null;
  }

  function storySignature(story) {
    const actor = story.querySelector(
      "a[role='link'][aria-label],a[role='link'][href]"
    );
    const menu = story.querySelector(
      "[aria-label^='Hide post by '],[aria-label^='Actions for this post by ']"
    );
    const reelLink = Array.from(story.querySelectorAll("a[href]")).find(
      (link) =>
        belongsToStory(link, story) &&
        core.matchesFacebookReelUrl(link.getAttribute("href"))
    );
    return [
      story.getAttribute("aria-posinset") || "",
      actor?.getAttribute("href") || actor?.getAttribute("aria-label") || "",
      menu?.getAttribute("aria-label") || "",
      reelLink?.getAttribute("href") || "",
      core.normalizeText(story.textContent).slice(0, 180)
    ].join("|");
  }

  function confidenceLabel(value) {
    return `${Math.round(Number(value || 0) * 100)}%`;
  }

  function kindLabel(kind) {
    if (kind === "ad") {
      return "Ad";
    }
    if (kind === "sponsored") {
      return "Sponsored";
    }
    if (kind === "suggested") {
      return "Suggested";
    }
    if (kind === "reel") {
      return "Reel";
    }
    if (kind === "word-filter") {
      return "Custom word";
    }
    if (kind === "ai-content") {
      return "AI Content";
    }
    if (kind === "app-game") {
      return "Game/App post";
    }
    if (kind === "became-friends") {
      return "Became Friends";
    }
    if (kind === "liked-page") {
      return "Liked a Page";
    }
    if (kind === "joined-group") {
      return "Joined a Group";
    }
    if (kind === "attending-event") {
      return "Attending an Event";
    }
    if (kind === "attended-event") {
      return "Attended an Event";
    }
    if (kind === "products-shown") {
      return "Products Shown";
    }
    return "Feed item";
  }

  function ensureRevealControl(story) {
    if (story.querySelector(":scope > .fffc-reveal-control")) {
      return;
    }
    const control = document.createElement("div");
    control.className = "fffc-reveal-control";
    const description = document.createElement("span");
    description.className = "fffc-reveal-description";
    const button = document.createElement("button");
    button.className = "fffc-reveal-button";
    button.type = "button";
    button.textContent = "Show";
    control.append(description, button);
    story.appendChild(control);
  }

  function clearMatch(container) {
    for (const key of [
      "fffcKind",
      "fffcSource",
      "fffcReason",
      "fffcConfidence",
      "fffcLabel",
      "fffcReel",
      "fffcActivity",
      "fffcRevealed",
      "fffcSurfaceContainer"
    ]) {
      delete container.dataset[key];
    }
    container.querySelector(":scope > .fffc-reveal-control")?.remove();
  }

  function markContainer(container, record, signature, options = {}) {
    const previous = storyState.get(container);
    const firstMatch = !previous?.record;
    const changed =
      previous?.record &&
      (previous.record.kind !== record.kind ||
        previous.record.reason !== record.reason);
    const unchanged =
      previous?.record &&
      !changed &&
      previous.signature === signature &&
      container.dataset.fffcKind === record.kind &&
      container.dataset.fffcReason === record.reason;

    if (unchanged) {
      previous.misses = 0;
      previous.lastSeenPass = reconciliationPass;
      return;
    }

    container.dataset.fffcKind = record.kind;
    container.dataset.fffcSource = record.source;
    container.dataset.fffcReason = record.reason;
    container.dataset.fffcConfidence = confidenceLabel(record.confidence);
    container.dataset.fffcLabel = record.title
      ? `${kindLabel(record.kind)} · ${record.label} · '${record.title}' · ` +
        `${confidenceLabel(record.confidence)}`
      : `${kindLabel(record.kind)} · ${record.label} · ` +
        `${confidenceLabel(record.confidence)}`;
    if (settings.displayMode !== "debug") {
      lastFilterMutationAt = performance.now();
    }
    if (options.surfaceContainer) {
      container.dataset.fffcSurfaceContainer = options.surfaceContainer;
    }

    if (!options.noRevealControl) {
      ensureRevealControl(container);
      const description = container.querySelector(
        ":scope > .fffc-reveal-control .fffc-reveal-description"
      );
      if (description) {
        description.textContent = container.dataset.fffcLabel;
      }
    }

    if (firstMatch) {
      counters.uniqueMatches += 1;
    }
    if (changed) {
      counters.reclassifications += 1;
    }
    counters.classificationEvents += 1;
    increment(counters.byReason, record.reason);
    increment(counters.bySource, record.source);
    storyState.set(container, {
      signature,
      record,
      misses: 0,
      firstSeen: previous?.firstSeen || performance.now(),
      lastSeenPass: reconciliationPass
    });
  }

  function handleNoMatch(story, signature) {
    const previous = storyState.get(story);
    if (!previous) {
      storyState.set(story, {
        signature,
        record: null,
        misses: 0,
        firstSeen: performance.now(),
        lastSeenPass: reconciliationPass
      });
      return;
    }
    if (!previous.record) {
      previous.signature = signature;
      return;
    }
    if (previous.signature !== signature) {
      clearMatch(story);
      counters.clearedRecycledMatches += 1;
      storyState.set(story, {
        signature,
        record: null,
        misses: 0,
        firstSeen: performance.now(),
        lastSeenPass: reconciliationPass
      });
      return;
    }
    if (previous.lastSeenPass === reconciliationPass) {
      return;
    }
    previous.lastSeenPass = reconciliationPass;
    previous.misses += 1;
    if (previous.misses >= MATCH_MISS_LIMIT) {
      clearMatch(story);
      previous.record = null;
      previous.misses = 0;
    }
  }

  function scanStory(story) {
    if (!story?.isConnected || !isFeedStory(story)) {
      return;
    }
    counters.postsScanned += 1;
    const signature = storySignature(story);
    let previous = storyState.get(story);
    if (!previous) {
      previous = {
        signature,
        record: null,
        misses: 0,
        firstSeen: performance.now(),
        lastSeenPass: reconciliationPass
      };
      storyState.set(story, previous);
    } else if (previous.signature !== signature && previous.record) {
      clearMatch(story);
      counters.clearedRecycledMatches += 1;
      previous = {
        signature,
        record: null,
        misses: 0,
        firstSeen: performance.now(),
        lastSeenPass: reconciliationPass
      };
      storyState.set(story, previous);
    }

    const reel = findReelStorySignal(story);
    if (reel) {
      story.dataset.fffcReel = "1";
    } else {
      delete story.dataset.fffcReel;
    }

    /*
     * Set independently of markContainer's kind/reason fields, same as the
     * reel flag above: CSS needs a single stable attribute to hide any of
     * the seven activity kinds, without seven kind-value selectors to keep
     * in sync as FEED_EVENT_RULES grows.
     */
    const activity = activitySignal(story);
    if (activity) {
      story.dataset.fffcActivity = "1";
    } else {
      delete story.dataset.fffcActivity;
    }

    const ad = findAdSignal(story);
    if (ad) {
      if (ad.kind === "sponsored") {
        counters.sponsoredMatches += 1;
      } else {
        counters.adMatches += 1;
      }
      markContainer(story, ad, signature);
      return;
    }

    const aiContent = aiContentSignal(story);
    if (aiContent) {
      markContainer(story, aiContent, signature);
      return;
    }

    const suggestion = findSuggestionSignal(story);
    if (suggestion) {
      const age = performance.now() - previous.firstSeen;
      if (settings.displayMode === "hide" && age < SUGGESTION_SETTLE_MS) {
        window.setTimeout(
          () => queueStory(story, "suggestion-settled"),
          SUGGESTION_SETTLE_MS - age + 20
        );
        return;
      }
      markContainer(story, suggestion, signature);
      return;
    }

    if (activity) {
      counters.activityMatches += 1;
      markContainer(
        story,
        {
          ...activity,
          label: activity.reason,
          source: "activity-post-filter",
          activityFilter: true
        },
        signature
      );
      return;
    }

    const customWord = customWordFilterSignal(story);
    if (customWord) {
      markContainer(story, customWord, signature);
      return;
    }

    if (reel) {
      counters.reelStoryMatches += 1;
      markContainer(story, reel, signature);
      return;
    }
    handleNoMatch(story, signature);
  }

  function railHeadings(rail) {
    return Array.from(
      rail.querySelectorAll("h2,h3,h4,[role='heading']")
    );
  }

  function protectedRailHeading(element) {
    const text = core.normalizeText(element.innerText || element.textContent);
    return /^(contacts|group chats|birthdays?)$/i.test(text);
  }

  function sponsoredRailHeading(element) {
    const text = core.normalizeText(element.innerText || element.textContent);
    return /^sponsored$/i.test(text);
  }

  function suggestedGroupsRailHeading(element) {
    const text = core.normalizeText(element.innerText || element.textContent);
    return /^suggested groups?$/i.test(text);
  }

  function groupChatsRailHeading(element) {
    const text = core.normalizeText(element.innerText || element.textContent);
    return /^group chats?$/i.test(text);
  }

  /*
   * Right-rail modules are identified by their own heading text rather than
   * markContainer's kind/reason scheme (there is no per-post story to hang
   * a reveal control off). Marking stays unconditional here, same as the
   * sponsored rule always has - content.css decides visibility per rule's
   * own root setting flag, so toggling a checkbox off takes effect the
   * instant the stylesheet re-evaluates rather than waiting on a rescan.
   * Each rule owns its own module-tracking WeakSet so a branch matched
   * under one rule can never suppress the count for another.
   *
   * The Group chats rule below targets the exact heading text that
   * protectedRailHeading treats as off-limits for every OTHER rule's climb
   * (so Sponsored/Suggested-Groups can never swallow it as a side effect).
   * That guard only excludes a heading from being climbed OVER by a
   * different heading's branch - it does not stop this rule matching that
   * same heading directly, so opting in to Hide Group Chats still only ever
   * hides exactly that section, never Contacts.
   */
  const RIGHT_RAIL_MODULE_RULES = [
    {
      matches: sponsoredRailHeading,
      flagAttribute: "fffcRightRailSponsored",
      label: "Sponsored · Right sidebar",
      reason: "right-rail-sponsored",
      headingCounter: "rightRailSponsoredHeadings",
      moduleCounter: "rightRailSponsoredModules",
      markedBranches: markedRightRailBranches
    },
    {
      matches: suggestedGroupsRailHeading,
      flagAttribute: "fffcSuggestedGroups",
      label: "Suggested Groups · Right sidebar",
      reason: "right-rail-suggested-groups",
      headingCounter: "rightRailSuggestedGroupsHeadings",
      moduleCounter: "rightRailSuggestedGroupsModules",
      markedBranches: new WeakSet()
    },
    {
      matches: groupChatsRailHeading,
      flagAttribute: "fffcGroupChats",
      label: "Group chats · Right sidebar",
      reason: "right-rail-group-chats",
      headingCounter: "rightRailGroupChatsHeadings",
      moduleCounter: "rightRailGroupChatsModules",
      markedBranches: new WeakSet()
    }
  ];

  /*
   * Bound the right-rail climb before Contacts or Group chats so a nearby
   * Sponsored heading cannot hide the entire contact list.
   */
  function railBranchForHeading(heading, rail) {
    let current = heading;
    let best = heading;
    while (current.parentElement && current.parentElement !== rail) {
      const parent = current.parentElement;
      const protectedInside = railHeadings(parent).some(
        (candidate) => candidate !== heading && protectedRailHeading(candidate)
      );
      if (protectedInside) {
        counters.rightRailProtectedStops += 1;
        break;
      }
      if (parent.querySelector(STORY_SELECTOR)) {
        break;
      }
      best = parent;
      current = parent;
    }
    return best;
  }

  function scanRightRail() {
    if (!["home", "feeds"].includes(core.surfaceKind(location.pathname))) {
      return;
    }
    for (const rail of document.querySelectorAll(
      "[role='complementary'],[data-pagelet='RightRail']"
    )) {
      for (const heading of railHeadings(rail)) {
        const rule = RIGHT_RAIL_MODULE_RULES.find((candidate) =>
          candidate.matches(heading)
        );
        if (!rule) {
          continue;
        }
        counters[rule.headingCounter] += 1;
        const branch = railBranchForHeading(heading, rail);
        if (!branch || branch === rail) {
          continue;
        }
        branch.dataset[rule.flagAttribute] = "1";
        branch.dataset.fffcLabel = rule.label;
        if (!rule.markedBranches.has(branch)) {
          rule.markedBranches.add(branch);
          counters[rule.moduleCounter] += 1;
          counters.uniqueMatches += 1;
          counters.classificationEvents += 1;
          increment(counters.byReason, rule.reason);
          increment(counters.bySource, "right-rail-section");
        }
      }
    }
  }

  function suggestedReelsHeading(element) {
    const text = core.normalizeText(element.innerText || element.textContent);
    return /^suggested reels?$/i.test(text);
  }

  function suggestionModuleForHeading(heading, main) {
    let current = heading;
    for (
      let depth = 0;
      current?.parentElement &&
      current.parentElement !== main &&
      depth < 12;
      depth += 1
    ) {
      current = current.parentElement;
      const mediaOrCards = current.querySelectorAll(
        "a[href*='/reel/'],a[href*='/reels/'],video,img,[role='link']"
      ).length;
      if (mediaOrCards >= 2) {
        return current;
      }
    }
    return heading.parentElement === main ? heading : heading.parentElement;
  }

  /*
   * Suggested Reels can be a main-column carousel rather than a story.
   * Process the module separately so its heading is not missed.
   */
  function scanSuggestionModules(admitVisible = false) {
    if (!["home", "feeds"].includes(core.surfaceKind(location.pathname))) {
      return;
    }
    if (admitVisible) {
      viewportModuleCohort.clear();
    }
    for (const main of document.querySelectorAll(MAIN_SELECTOR)) {
      for (const heading of main.querySelectorAll(
        "h2,h3,h4,h5,[role='heading']"
      )) {
        if (!suggestedReelsHeading(heading) || closestStory(heading)) {
          continue;
        }
        counters.suggestionModuleHeadings += 1;
        const module = suggestionModuleForHeading(heading, main);
        if (!module || module === main) {
          continue;
        }
        if (admitVisible && intersectsViewport(module)) {
          viewportModuleCohort.add(module);
        }
        if (!viewportModuleCohort.has(module)) {
          continue;
        }
        const existing =
          module.dataset.fffcReason === "suggested-reels-module";
        const reelExisting = module.dataset.fffcReel === "1";
        module.dataset.fffcReel = "1";
        markContainer(
          module,
          {
            kind: "suggested",
            label: "Suggested Reels",
            source: "exact-suggestion-module-heading",
            reason: "suggested-reels-module",
            confidence: 0.99
          },
          [
            "suggested-reels",
            module.querySelector("a[href]")?.getAttribute("href") || ""
          ].join("|"),
          { surfaceContainer: "suggested-reels-module" }
        );
        if (!existing) {
          counters.suggestionModuleMatches += 1;
        }
        if (!reelExisting) {
          counters.reelModuleMatches += 1;
        }
      }
    }
  }

  function reelModuleHeading(element) {
    const text = core.normalizeText(element.innerText || element.textContent);
    return /^(?:reels?|reels? and short videos|reels? for you|suggested reels?)$/i.test(
      text
    );
  }

  /*
   * Reel shelves are non-story modules, so they need the same independent,
   * viewport-driven pass used for Suggested Reels. Exact Facebook Reel links
   * are required; a generic heading, video or image is not sufficient.
   */
  function scanReelModules(admitVisible = false) {
    if (!["home", "feeds"].includes(core.surfaceKind(location.pathname))) {
      return;
    }
    if (admitVisible) {
      viewportReelModuleCohort.clear();
    }
    for (const main of document.querySelectorAll(MAIN_SELECTOR)) {
      for (const heading of main.querySelectorAll(
        "h2,h3,h4,h5,[role='heading']"
      )) {
        if (!reelModuleHeading(heading) || closestStory(heading)) {
          continue;
        }
        counters.reelModuleHeadings += 1;
        const module = suggestionModuleForHeading(heading, main);
        if (!module || module === main) {
          continue;
        }
        const reelLinks = Array.from(module.querySelectorAll("a[href]")).filter(
          (link) => core.matchesFacebookReelUrl(link.getAttribute("href"))
        );
        if (reelLinks.length < 2) {
          continue;
        }
        if (admitVisible && intersectsViewport(module)) {
          viewportReelModuleCohort.add(module);
        }
        if (!viewportReelModuleCohort.has(module)) {
          continue;
        }
        const existing = module.dataset.fffcReel === "1";
        module.dataset.fffcReel = "1";
        if (!module.dataset.fffcKind) {
          markContainer(
            module,
            {
              kind: "reel",
              label: "Reels",
              source: "exact-reel-module-heading-and-links",
              reason: "reel-module",
              confidence: 0.99
            },
            [
              "reel-module",
              reelLinks[0]?.getAttribute("href") || ""
            ].join("|"),
            { surfaceContainer: "reel-module" }
          );
        }
        if (!existing) {
          counters.reelModuleMatches += 1;
        }
      }
    }
  }

  function storiesTrayHeading(element) {
    const text = core.normalizeText(element.innerText || element.textContent);
    return /^stories$/i.test(text);
  }

  /*
   * The Stories tray is a single top-of-feed shelf, not a per-post module.
   * Its aria-label landmark is the primary signal because accessibility
   * labels tend to survive Facebook's class-name churn better than markup
   * structure - the same reasoning that made aria-labelledby text the
   * reliable signal for ad detection. A heading-climb fallback catches
   * layouts where the landmark role is absent, gated on at least one real
   * /stories/ link so an unrelated module heading can't match.
   */
  function scanStoriesTray(admitVisible = false) {
    if (!["home", "feeds"].includes(core.surfaceKind(location.pathname))) {
      return;
    }
    if (admitVisible) {
      viewportStoriesTrayCohort.clear();
    }

    const candidates = new Set(
      Array.from(document.querySelectorAll('div[aria-label="Stories"]')).filter(
        (element) => !isExcludedRegion(element)
      )
    );

    for (const main of document.querySelectorAll(MAIN_SELECTOR)) {
      for (const heading of main.querySelectorAll(
        "h2,h3,h4,h5,[role='heading']"
      )) {
        if (!storiesTrayHeading(heading) || closestStory(heading)) {
          continue;
        }
        const module = suggestionModuleForHeading(heading, main);
        if (!module || module === main) {
          continue;
        }
        const storyLinks = module.querySelectorAll(
          "a[href*='/stories/']"
        ).length;
        if (storyLinks < 1) {
          continue;
        }
        candidates.add(module);
      }
    }

    for (const tray of candidates) {
      if (admitVisible && intersectsViewport(tray)) {
        viewportStoriesTrayCohort.add(tray);
      }
      if (!viewportStoriesTrayCohort.has(tray)) {
        continue;
      }
      const existing = tray.dataset.fffcStoriesTray === "1";
      tray.dataset.fffcStoriesTray = "1";
      tray.dataset.fffcLabel = "Stories tray";
      if (!existing) {
        counters.storiesTrayMatches += 1;
        counters.uniqueMatches += 1;
        counters.classificationEvents += 1;
        increment(counters.byReason, "stories-tray");
        increment(counters.bySource, "stories-tray-landmark");
      }
    }
  }

  function visibleShortElement(element) {
    const rectangle = element.getBoundingClientRect?.();
    return (
      hasPositiveRect(rectangle) &&
      intersectsViewport(element) &&
      !hiddenByAncestors(element, document.body)
    );
  }

  function marketplacePlainTextLabels(main) {
    const labels = [];
    let visited = 0;
    const walker = document.createTreeWalker(
      main,
      NodeFilter.SHOW_TEXT
    );
    while (walker.nextNode() && visited < 12000) {
      visited += 1;
      const text = core.normalizeText(walker.currentNode.nodeValue);
      if (!/^(?:ad|sponsored)$/i.test(text)) {
        continue;
      }
      const element = walker.currentNode.parentElement;
      const rectangle = element?.getBoundingClientRect?.();
      if (
        element &&
        element.childElementCount <= 1 &&
        hasPositiveRect(rectangle) &&
        intersectsViewport(element)
      ) {
        labels.push(element);
      }
    }
    return labels;
  }

  function marketplaceCardForLabel(element) {
    const labelRectangle = element.getBoundingClientRect?.();
    if (!hasPositiveRect(labelRectangle)) {
      return null;
    }
    let current = element;
    for (
      let depth = 0;
      current && current !== document.body && depth < 15;
      depth += 1
    ) {
      const cardRectangle = current.getBoundingClientRect?.();
      const hasListingLink =
        current.matches?.("a[href]") ||
        Boolean(current.querySelector?.("a[href]"));
      if (hasPositiveRect(cardRectangle) && hasListingLink) {
        for (const media of Array.from(
          current.querySelectorAll?.("img,[role='img'],video") || []
        ).slice(0, 28)) {
          if (
            core.isMarketplaceCardGeometry(
              cardRectangle,
              labelRectangle,
              media.getBoundingClientRect?.()
            )
          ) {
            return current;
          }
        }
      }
      current = current.parentElement;
    }
    return null;
  }

  function marketplaceCardForPlacementLink(link) {
    let current = link?.parentElement || null;
    for (
      let depth = 0;
      current && current !== document.body && depth < 18;
      depth += 1
    ) {
      if (current.matches?.(MAIN_SELECTOR)) {
        break;
      }
      const cardRectangle = current.getBoundingClientRect?.();
      if (!hasPositiveRect(cardRectangle)) {
        current = current.parentElement;
        continue;
      }
      const boundedCard =
        cardRectangle.width >= 140 &&
        cardRectangle.width <= 720 &&
        cardRectangle.height >= 150 &&
        cardRectangle.height <= 1100;
      if (!boundedCard) {
        current = current.parentElement;
        continue;
      }
      const links = Array.from(
        current.querySelectorAll?.("a[href]") || []
      ).slice(0, 80);
      if (
        links.length === 0 ||
        !links.some((candidate) =>
          core.matchesMarketplacePlacementUrl(
            candidate.getAttribute("href")
          )
        )
      ) {
        current = current.parentElement;
        continue;
      }
      for (const media of Array.from(
        current.querySelectorAll?.("img,[role='img'],video") || []
      ).slice(0, 32)) {
        const mediaRectangle = media.getBoundingClientRect?.();
        if (!hasPositiveRect(mediaRectangle)) {
          continue;
        }
        const mediaInside =
          mediaRectangle.left >= cardRectangle.left - 18 &&
          mediaRectangle.right <= cardRectangle.right + 18 &&
          mediaRectangle.top >= cardRectangle.top - 12 &&
          mediaRectangle.bottom <= cardRectangle.bottom + 12;
        const substantialMedia =
          mediaRectangle.width >=
            Math.max(110, cardRectangle.width * 0.38) &&
          mediaRectangle.height >= 90;
        const detailSpace =
          mediaRectangle.top - cardRectangle.top >= 44 ||
          cardRectangle.bottom - mediaRectangle.bottom >= 44;
        if (mediaInside && substantialMedia && detailSpace) {
          return current;
        }
      }
      current = current.parentElement;
    }
    return null;
  }

  function marketplaceCardAdmitted(card, admitVisible) {
    const firstObservation = !observedMarketplaceCards.has(card);
    if (firstObservation) {
      observedMarketplaceCards.add(card);
    }
    if (
      intersectsViewport(card) &&
      (admitVisible || firstObservation)
    ) {
      viewportMarketplaceCohort.add(card);
      if (firstObservation && !admitVisible) {
        counters.marketplaceDynamicAdmissions += 1;
      }
    }
    return viewportMarketplaceCohort.has(card);
  }

  function scanMarketplacePlacementLinks(admitVisible) {
    const links = Array.from(
      document.querySelectorAll(`${MAIN_SELECTOR} a[href]`)
    ).slice(0, 3200);
    const cards = new Set();
    for (const link of links) {
      if (
        !core.matchesMarketplacePlacementUrl(
          link.getAttribute("href")
        )
      ) {
        continue;
      }
      counters.marketplacePlacementLinks += 1;
      const card = marketplaceCardForPlacementLink(link);
      if (!card) {
        continue;
      }
      cards.add(card);
    }

    for (const card of cards) {
      counters.marketplacePlacementCards += 1;
      if (!marketplaceCardAdmitted(card, admitVisible)) {
        continue;
      }
      const existing = Boolean(card.dataset.fffcKind);
      markContainer(
        card,
        {
          kind: "ad",
          label: "Marketplace advertisement",
          confidence: 1,
          source: "marketplace-placement-link",
          reason: "marketplace-advertising"
        },
        "marketplace-placement",
        { surfaceContainer: "marketplace-card" }
      );
      if (!existing) {
        counters.marketplaceMatches += 1;
      }
    }
  }

  // Marketplace uses a separate card boundary but the shared hide state.
  function scanMarketplace(admitVisible = false) {
    if (/^\/marketplace\/you\/selling/.test(location.pathname)) {
      return;
    }
    if (admitVisible) {
      viewportMarketplaceCohort.clear();
    }
    counters.marketplaceCardsScanned += 1;
    scanMarketplacePlacementLinks(admitVisible);
    if (core.surfaceKind(location.pathname) !== "marketplace") {
      return;
    }
    const candidateSet = new Set(
      Array.from(
        document.querySelectorAll(
          `${MAIN_SELECTOR} a,${MAIN_SELECTOR} [aria-labelledby],` +
            `${MAIN_SELECTOR} span[style*='display: flex'],` +
            `${MAIN_SELECTOR} span[style*='display:flex']`
        )
      ).slice(0, 1600)
    );
    for (const main of document.querySelectorAll(MAIN_SELECTOR)) {
      for (const label of marketplacePlainTextLabels(main)) {
        candidateSet.add(label);
      }
    }
    const candidates = Array.from(candidateSet);
    for (const element of candidates) {
      let signal = null;
      if (visibleShortElement(element)) {
        signal = decodeAdCandidate(element);
      }
      if (!signal) {
        continue;
      }
      counters.marketplaceLabelCandidates += 1;
      const card = marketplaceCardForLabel(element);
      if (!card) {
        continue;
      }
      if (!marketplaceCardAdmitted(card, admitVisible)) {
        continue;
      }
      const existing = Boolean(card.dataset.fffcKind);
      markContainer(
        card,
        {
          ...signal,
          source: `marketplace-${signal.source}`,
          reason: "marketplace-advertising"
        },
        card.querySelector("a[href]")?.getAttribute("href") || "marketplace",
        { surfaceContainer: "marketplace-card" }
      );
      if (!existing) {
        counters.marketplaceMatches += 1;
      }
    }
  }

  function countByAttribute(elements, attribute) {
    const result = Object.create(null);
    for (const element of elements) {
      const value = element.getAttribute(attribute);
      if (value) {
        increment(result, value);
      }
    }
    return result;
  }

  /*
   * Scoped DOM capture for bug reports. A full document.documentElement
   * dump (the "open DevTools, allow pasting, copy(...)" workflow) is both
   * inaccessible to non-technical users and the wrong shape for debugging -
   * every capture that's actually resolved a real bug has been a single
   * post's markup, not several MB of unrelated page chrome. This captures
   * just the story elements the classifier currently sees (plus the right
   * rail), sanitized and size-capped.
   */
  const CAPTURE_MAX_STORIES = 40;
  /*
   * A live capture (2026-08-12) showed real in-viewport posts running
   * 96,574-124,283 chars uncapped - the original 20,000-char cap (ported
   * from a source that hadn't hit a post that large) truncated every one
   * of them before reaching the actual header/caption text, so the post
   * being debugged silently vanished from its own capture.
   *
   * These are meant to never be hit by a real post - only to stop a
   * pathological one (e.g. a runaway decoy-glyph flood, or every one of
   * 40 stories being non-virtualized at once) from producing a capture
   * too large for chrome.tabs.sendMessage or the download to handle
   * cleanly. Sized with roughly 15x headroom above the largest post seen
   * so far, not tuned to that exact number. Raise further if a real post
   * ever hits this ceiling.
   */
  const CAPTURE_MAX_HTML_PER_STORY = 2000000;
  const CAPTURE_MAX_TOTAL_HTML = 20000000;
  const CAPTURE_STRIP_SELECTOR = "script,style,noscript,template";
  // SVG geometry attributes are parsed eagerly by the browser - even on a
  // detached clone that's never rendered - so slicing them mid-value and
  // appending "...[truncated, N chars total]" text produces invalid path/
  // point syntax and throws a console error (e.g. "<path> attribute d:
  // Expected number, ..."). Icon SVGs routinely exceed 300 chars, so this
  // fired on nearly every capture. Left at full length instead: these
  // aren't the tracking-URL bloat the truncation exists for.
  const CAPTURE_TRUNCATION_EXEMPT_ATTRS = new Set(["d", "points"]);

  function sanitizeCloneForCapture(node) {
    const clone = node.cloneNode(true);
    for (const el of clone.querySelectorAll(CAPTURE_STRIP_SELECTOR)) {
      el.remove();
    }
    for (const el of clone.querySelectorAll("*")) {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name;
        const value = attr.value || "";
        if (
          (name === "src" || name === "srcset" || name === "href") &&
          value.startsWith("data:")
        ) {
          el.setAttribute(name, `[data-uri omitted, ${value.length} chars]`);
          continue;
        }
        if (
          value.length > 300 &&
          !CAPTURE_TRUNCATION_EXEMPT_ATTRS.has(name)
        ) {
          el.setAttribute(
            name,
            `${value.slice(0, 300)}...[truncated, ${value.length} chars total]`
          );
        }
      }
    }
    return clone;
  }

  function describeCaptureSubject(element) {
    const rect = element.getBoundingClientRect();
    const fffcAttrs = Array.from(element.attributes)
      .filter((a) => a.name.startsWith("data-fffc-"))
      .map((a) => `${a.name}="${a.value}"`)
      .join(" ");
    return (
      `top=${Math.round(rect.top)} height=${Math.round(rect.height)} ` +
      `inViewport=${intersectsViewport(element)} ${fffcAttrs}`.trim()
    );
  }

  // Shared "is there anything actually here" check: a loading skeleton
  // and a virtualized/scrolled-away placeholder both render as elements
  // with essentially no text, so this one check covers both without
  // needing to know Facebook's specific attribute names for either.
  function hasSubstantialText(element) {
    return core.normalizeText(element.textContent).length > 40;
  }

  /*
   * Geometry-only fallback for when storyCandidates() finds nothing
   * substantial. Two different ways that's been observed to happen this
   * session: every candidate being virtualized/empty at the exact
   * capture instant (routine, seen repeatedly), or Facebook rendering a
   * feed structure that carries neither aria-posinset nor role='article'
   * at all (2026-08-12: a Mac Chrome tester saw posts rendering fine on
   * screen while storyCandidates() found nothing but stray loading
   * skeletons all session). Rather than add a third named selector -
   * which just repeats the same fragile-forever problem the next time
   * Facebook's markup shifts - this looks for large, currently-visible,
   * text-bearing blocks directly under <main>, using nothing Facebook-
   * specific at all: size, viewport visibility and text content. Cruder
   * and less precisely-scoped than the semantic capture, but it survives
   * any future markup change without needing another patch. Only used as
   * a supplement when the semantic capture looks empty, never replaces
   * it, so it costs nothing on the common path where detection is fine.
   */
  const CAPTURE_FALLBACK_MIN_HEIGHT = 150;

  function fallbackVisibleContentBlocks() {
    const maxHeight = Math.max(2000, window.innerHeight * 2);
    const kept = [];
    for (const main of document.querySelectorAll(MAIN_SELECTOR)) {
      for (const el of main.querySelectorAll("*")) {
        if (kept.length >= CAPTURE_MAX_STORIES) {
          return kept;
        }
        const rect = el.getBoundingClientRect();
        if (
          rect.height < CAPTURE_FALLBACK_MIN_HEIGHT ||
          rect.height > maxHeight ||
          !intersectsViewport(el) ||
          !hasSubstantialText(el) ||
          kept.some((k) => k.contains(el))
        ) {
          continue;
        }
        kept.push(el);
      }
    }
    return kept;
  }

  function captureDomSnapshot() {
    const stories = storyCandidates().slice(0, CAPTURE_MAX_STORIES);
    const sections = [];
    let totalHtml = 0;
    let truncatedForSize = false;
    let substantialCount = 0;

    function appendCapture(label, element) {
      if (totalHtml >= CAPTURE_MAX_TOTAL_HTML) {
        truncatedForSize = true;
        return;
      }
      let html;
      try {
        html = sanitizeCloneForCapture(element).outerHTML;
      } catch (error) {
        html = `[capture failed: ${error?.message || error}]`;
      }
      if (html.length > CAPTURE_MAX_HTML_PER_STORY) {
        html = `${html.slice(
          0,
          CAPTURE_MAX_HTML_PER_STORY
        )}\n...[truncated, ${html.length} chars total]`;
      }
      totalHtml += html.length;
      sections.push(`\n===== ${label} =====\n${html}`);
    }

    stories.forEach((story, index) => {
      if (hasSubstantialText(story)) {
        substantialCount += 1;
      }
      appendCapture(
        `STORY ${index + 1} — ${describeCaptureSubject(story)}`,
        story
      );
    });

    const fallbackBlocks =
      substantialCount === 0 ? fallbackVisibleContentBlocks() : [];
    fallbackBlocks.forEach((block, index) => {
      appendCapture(
        `FALLBACK VISIBLE BLOCK ${index + 1} — ${describeCaptureSubject(block)}`,
        block
      );
    });

    const rightRail = document.querySelector(
      "[role='complementary'],[data-pagelet='RightRail']"
    );
    if (rightRail) {
      appendCapture("RIGHT RAIL", rightRail);
    }

    if (truncatedForSize) {
      sections.push(
        `\n[Some content omitted — total capture reached the ${CAPTURE_MAX_TOTAL_HTML}-char cap.]`
      );
    }

    sections.unshift(
      `URL: ${location.href}\n` +
        `Captured: ${new Date().toISOString()}\n` +
        `Build: ${BUILD_VERSION}\n` +
        `Stories found: ${stories.length} (${substantialCount} with real content)` +
        (stories.length === CAPTURE_MAX_STORIES
          ? ` (capped at ${CAPTURE_MAX_STORIES})`
          : "") +
        (fallbackBlocks.length
          ? `\nFallback capture used: the normal story detection found no ` +
            `substantial content, so ${fallbackBlocks.length} geometry-based ` +
            `block(s) were captured instead - see the FALLBACK VISIBLE BLOCK ` +
            `section(s) below. This usually means either every story was ` +
            `virtualized/empty at the moment of capture, or this page's feed ` +
            `structure doesn't match any selector this build recognizes.`
          : "")
    );

    const text = sections.join("\n");
    return {
      text,
      meta: {
        storiesCaptured: stories.length,
        substantialStoriesCaptured: substantialCount,
        fallbackBlocksCaptured: fallbackBlocks.length,
        totalChars: text.length,
        truncatedForSize
      }
    };
  }

  function statusSnapshot() {
    const matches = Array.from(
      document.querySelectorAll("[data-fffc-kind]")
    );
    const byKind = countByAttribute(matches, "data-fffc-kind");
    return {
      schemaVersion: 3,
      runtime: {
        contentScriptVersion: BUILD_VERSION
      },
      surface: core.surfaceKind(location.pathname),
      language: String(document.documentElement.lang || "unknown").slice(0, 24),
      settings: {
        enabled: settings.enabled,
        hideSponsored: settings.hideSponsored,
        hideSuggested: settings.hideSuggested,
        hideReels: settings.hideReels,
        hideStories: settings.hideStories,
        hideSuggestedGroups: settings.hideSuggestedGroups,
        hideGroupChats: settings.hideGroupChats,
        enableWordFilters: settings.enableWordFilters,
        filterAiContent: settings.filterAiContent,
        customWordFilterCount: settings.customWordFilters.length,
        displayMode: settings.displayMode,
        activityFiltersEnabled: core.ACTIVITY_FILTER_KEYS.filter(
          (key) => settings[key]
        ).length
      },
      current: {
        ad: Number(byKind.ad || 0),
        sponsored: Number(byKind.sponsored || 0),
        suggested: Number(byKind.suggested || 0),
        reel: document.querySelectorAll("[data-fffc-reel='1']").length,
        wordFilter: Number(byKind["word-filter"] || 0),
        aiContent: Number(byKind["ai-content"] || 0),
        activity: Object.keys(ACTIVITY_KIND_SETTINGS).reduce(
          (total, kind) => total + Number(byKind[kind] || 0),
          0
        ),
        rightRailSponsored: document.querySelectorAll(
          "[data-fffc-right-rail-sponsored='1']"
        ).length,
        suggestedGroups: document.querySelectorAll(
          "[data-fffc-suggested-groups='1']"
        ).length,
        groupChats: document.querySelectorAll(
          "[data-fffc-group-chats='1']"
        ).length,
        storiesTray: document.querySelectorAll(
          "[data-fffc-stories-tray='1']"
        ).length,
        marketplace: matches.filter(
          (element) =>
            element.dataset.fffcSurfaceContainer === "marketplace-card"
        ).length,
        revealed: matches.filter(
          (element) => element.dataset.fffcRevealed === "1"
        ).length,
        byReason: countByAttribute(matches, "data-fffc-reason"),
        bySource: countByAttribute(matches, "data-fffc-source")
      },
      session: {
        startedAt: counters.startedAt,
        uptimeSeconds: Math.max(0, Math.round(performance.now() / 1000)),
        uniqueMatches: counters.uniqueMatches,
        classificationEvents: counters.classificationEvents,
        reclassifications: counters.reclassifications,
        userReveals: counters.userReveals,
        byReason: { ...counters.byReason },
        bySource: { ...counters.bySource }
      },
      health: {
        observerStarted,
        reconciliationPasses: counters.reconciliationPasses,
        mutationBatches: counters.mutationBatches,
        startupRescans: counters.startupRescans,
        storyCandidatesNow: storyCandidates().length,
        storyCandidatesSeen: counters.storyCandidatesSeen,
        orphanArticleCandidatesSeen:
          counters.orphanArticleCandidatesSeen,
        geometryFallbackCandidatesSeen:
          counters.geometryFallbackCandidatesSeen,
        storiesObserved: counters.storiesObserved,
        viewportCohortSize: viewportStoryCohort.size,
        viewportCohortRefreshes: counters.viewportCohortRefreshes,
        viewportEntries: counters.viewportEntries,
        offscreenStoriesDeferred: counters.offscreenStoriesDeferred,
        storyGeometryFallbackAdmissions:
          counters.storyGeometryFallbackAdmissions,
        layoutScrollsSuppressed: counters.layoutScrollsSuppressed,
        postsScanned: counters.postsScanned,
        queueDepth: queue.size,
        queueFlushes: counters.queueFlushes,
        queueFallbackFlushes: counters.queueFallbackFlushes,
        queueHighWater: counters.queueHighWater,
        navigationRescans: counters.navigationRescans,
        visibilityRescans: counters.visibilityRescans,
        viewportRescans: counters.viewportRescans,
        headerCandidatesChecked: counters.headerCandidatesChecked,
        adLabelExcludedByHeadingAncestor:
          counters.adLabelExcludedByHeadingAncestor,
        suggestionActionExcludedByHeadingAncestor:
          counters.suggestionActionExcludedByHeadingAncestor,
        renderedHeaderTextCandidates:
          counters.renderedHeaderTextCandidates,
        renderedHeaderTokenMatches: counters.renderedHeaderTokenMatches,
        nestedObjectCandidates: counters.nestedObjectCandidates,
        scrambledHeaderCandidates: counters.scrambledHeaderCandidates,
        ctaButtonMarkerMatches: counters.ctaButtonMarkerMatches,
        directAdLabelMatches: counters.directAdLabelMatches,
        paidForByDisclosureMatches:
          counters.paidForByDisclosureMatches,
        glyphDecodeMatches: counters.glyphDecodeMatches,
        svgLabelMatches: counters.svgLabelMatches,
        labelledReferenceMatches: counters.labelledReferenceMatches,
        disclosureLinkMatches: counters.disclosureLinkMatches,
        canvasHeaderCandidates: counters.canvasHeaderCandidates,
        adMatches: counters.adMatches,
        sponsoredMatches: counters.sponsoredMatches,
        suggestionLabelMatches: counters.suggestionLabelMatches,
        aiContentMatches: counters.aiContentMatches,
        suggestionDismissControlMatches:
          counters.suggestionDismissControlMatches,
        ambiguousDismissControlsRejected:
          counters.ambiguousDismissControlsRejected,
        suggestionHeaderActionMatches:
          counters.suggestionHeaderActionMatches,
        recommendationPairMatches: counters.recommendationPairMatches,
        suggestionModuleHeadings: counters.suggestionModuleHeadings,
        suggestionModuleMatches: counters.suggestionModuleMatches,
        reelStoryMatches: counters.reelStoryMatches,
        reelModuleHeadings: counters.reelModuleHeadings,
        reelModuleMatches: counters.reelModuleMatches,
        storiesTrayMatches: counters.storiesTrayMatches,
        customWordFilterCandidates: counters.customWordFilterCandidates,
        customWordFilterMatches: counters.customWordFilterMatches,
        groupOriginProtections: counters.groupOriginProtections,
        ctaButtonGroupOriginProtections:
          counters.ctaButtonGroupOriginProtections,
        foreignActorProtections: counters.foreignActorProtections,
        activityMatches: counters.activityMatches,
        marketplaceLabelCandidates: counters.marketplaceLabelCandidates,
        marketplacePlacementLinks: counters.marketplacePlacementLinks,
        marketplacePlacementCards: counters.marketplacePlacementCards,
        marketplaceDynamicAdmissions:
          counters.marketplaceDynamicAdmissions,
        marketplaceCardsScanned: counters.marketplaceCardsScanned,
        marketplaceMatches: counters.marketplaceMatches,
        rightRailSponsoredHeadings: counters.rightRailSponsoredHeadings,
        rightRailSponsoredModules: counters.rightRailSponsoredModules,
        rightRailSuggestedGroupsHeadings:
          counters.rightRailSuggestedGroupsHeadings,
        rightRailSuggestedGroupsModules:
          counters.rightRailSuggestedGroupsModules,
        rightRailGroupChatsHeadings: counters.rightRailGroupChatsHeadings,
        rightRailGroupChatsModules: counters.rightRailGroupChatsModules,
        rightRailProtectedStops: counters.rightRailProtectedStops,
        rawDecoyStringsRejected: counters.rawDecoyStringsRejected,
        clearedRecycledMatches: counters.clearedRecycledMatches
      }
    };
  }

  function revealAll() {
    let changed = 0;
    for (const story of document.querySelectorAll("[data-fffc-kind]")) {
      if (story.dataset.fffcRevealed !== "1") {
        story.dataset.fffcRevealed = "1";
        changed += 1;
      }
    }
    counters.userReveals += changed;
    return changed;
  }

  function reapplyFiltering() {
    let changed = 0;
    for (const story of document.querySelectorAll(
      "[data-fffc-revealed='1']"
    )) {
      delete story.dataset.fffcRevealed;
      changed += 1;
    }
    runReconciliation("reapply");
    return changed;
  }

  function runReconciliation(reason, refreshViewport = false) {
    reconciliationPass += 1;
    counters.reconciliationPasses += 1;
    ensureMainLandmarkFallback();
    if (refreshViewport) {
      refreshViewportStories(reason);
    } else {
      queueViewportStories(reason);
    }
    scanRightRail();
    scanSuggestionModules(refreshViewport);
    scanReelModules(refreshViewport);
    scanStoriesTray(refreshViewport);
    scanMarketplace(refreshViewport);
  }

  function begin() {
    document.documentElement.dataset.fffcContentScriptVersion = BUILD_VERSION;
    applySettings(DEFAULTS);
    readSettings();
    runReconciliation("initial", true);

    for (const delay of STARTUP_RESCAN_DELAYS) {
      window.setTimeout(() => {
        counters.startupRescans += 1;
        runReconciliation("startup");
      }, delay);
    }
    window.setInterval(() => {
      if (location.href !== lastLocationHref) {
        lastLocationHref = location.href;
        applyMarketplaceDateFilter();
        counters.navigationRescans += 1;
        runReconciliation("route-change", true);
        return;
      }
      runReconciliation("straggler");
    }, RECONCILE_INTERVAL_MS);

    window.addEventListener("pageshow", () => {
      counters.navigationRescans += 1;
      runReconciliation("pageshow", true);
    });
    window.addEventListener("popstate", () => {
      lastLocationHref = location.href;
      applyMarketplaceDateFilter();
      counters.navigationRescans += 1;
      runReconciliation("popstate", true);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      counters.visibilityRescans += 1;
      runReconciliation("visibility", true);
    });
    window.addEventListener(
      "scroll",
      () => {
        if (
          performance.now() - lastFilterMutationAt <
          FILTER_LAYOUT_QUIET_MS
        ) {
          counters.layoutScrollsSuppressed += 1;
          return;
        }
        scheduleViewportRescan("scroll-settled");
      },
      { passive: true }
    );
    window.addEventListener(
      "resize",
      () => scheduleViewportRescan("resize-settled"),
      { passive: true }
    );

    document.addEventListener("click", (event) => {
      const button = event.target.closest?.(".fffc-reveal-button");
      if (!button) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const story = button.closest("[data-fffc-kind]");
      if (story) {
        story.dataset.fffcRevealed = "1";
        counters.userReveals += 1;
      }
    });

    const observer = new MutationObserver((mutations) => {
      counters.mutationBatches += 1;
      for (const mutation of mutations) {
        queueNode(mutation.target, "mutation-target");
        for (const node of mutation.addedNodes || []) {
          queueNode(node, "mutation-added");
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeFilter: [
        "href",
        "aria-label",
        "aria-labelledby",
        "hidden",
        "style",
        "class",
        "role",
        "aria-posinset"
      ]
    });
    observerStarted = true;
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return;
    }
    const next = { ...settings };
    for (const [key, change] of Object.entries(changes)) {
      next[key] = change.newValue;
    }
    applySettings(next);
    /*
     * A list edit changes the meaning of an existing word-filter result.
     * Clear only that rule's state so the shared reconciliation can classify
     * each affected story again immediately.
     */
    if (changes.enableWordFilters || changes.customWordFilters) {
      for (const story of document.querySelectorAll(
        "[data-fffc-kind='word-filter']"
      )) {
        clearMatch(story);
        storyState.delete(story);
      }
    }
    /*
     * Activity matches are gated in JS (activitySignal checks the setting
     * before returning), so a toggle flip alone leaves storyState's
     * miss-counter path to notice - up to MATCH_MISS_LIMIT reconciliation
     * passes later. Clear immediately so unchecking a filter un-hides its
     * posts as promptly as unchecking word filters already does.
     */
    if (core.ACTIVITY_FILTER_KEYS.some((key) => key in changes)) {
      for (const story of document.querySelectorAll(
        "[data-fffc-activity='1']"
      )) {
        clearMatch(story);
        storyState.delete(story);
      }
    }
    // filterAiContent is gated in JS the same way, for the same reason.
    if (changes.filterAiContent) {
      for (const story of document.querySelectorAll(
        "[data-fffc-kind='ai-content']"
      )) {
        clearMatch(story);
        storyState.delete(story);
      }
    }
    // Suggested subcategories are gated in JS the same way activity filters
    // are - see the comment above - so a toggle flip needs the same
    // immediate clear rather than waiting on the miss-counter path.
    if (core.SUGGESTED_SUBCATEGORY_KEYS.some((key) => key in changes)) {
      for (const story of document.querySelectorAll(
        "[data-fffc-kind='suggested']"
      )) {
        clearMatch(story);
        storyState.delete(story);
      }
    }
    runReconciliation("storage-change");
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "fffc:get-status") {
      sendResponse(statusSnapshot());
      return true;
    }
    if (message?.type === "fffc:capture-dom") {
      try {
        sendResponse(captureDomSnapshot());
      } catch (error) {
        sendResponse({ error: error?.message || String(error) });
      }
      return true;
    }
    if (message?.type === "fffc:reveal-all") {
      sendResponse({ changed: revealAll(), status: statusSnapshot() });
      return true;
    }
    if (message?.type === "fffc:reapply") {
      sendResponse({
        changed: reapplyFiltering(),
        status: statusSnapshot()
      });
      return true;
    }
    return undefined;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", begin, { once: true });
  } else {
    begin();
  }
})();
