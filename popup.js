(function initPopup() {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    hideSponsored: true,
    hideSuggested: true,
    hideReels: false,
    hideStories: false,
    hideSuggestedGroups: false,
    hideGroupChats: false,
    enableWordFilters: false,
    displayMode: "hide"
  };
  const EXTENSION_VERSION =
    chrome.runtime.getManifest().version_name ||
    chrome.runtime.getManifest().version;
  const STORAGE_KEYS = [
    "enabled",
    "hideSponsored",
    "hideSuggested",
    "hideReels",
    "hideStories",
    "hideSuggestedGroups",
    "hideGroupChats",
    "enableWordFilters",
    "displayMode",
    "debugMode"
  ];
  const checkboxIds = [
    "enabled",
    "hideSponsored",
    "hideSuggested",
    "hideReels",
    "hideStories",
    "hideSuggestedGroups",
    "hideGroupChats",
    "enableWordFilters"
  ];
  document.getElementById("extensionVersion").textContent =
    `v${EXTENSION_VERSION}`;
  const FACEBOOK_URL_PATTERN =
    /^https:\/\/(?:[^/]+\.)?facebook\.com(?:\/|$)/i;
  const statusText = document.getElementById("statusText");
  const surfaceBadge = document.getElementById("surfaceBadge");
  const actionMessage = document.getElementById("actionMessage");
  const reasonList = document.getElementById("reasonList");
  const reloadFacebookButton = document.getElementById("reloadFacebook");
  const pageActionButtons = [
    document.getElementById("exportDiagnostics"),
    document.getElementById("exportDomCapture"),
    document.getElementById("revealAll"),
    document.getElementById("reapply")
  ];
  let activeFacebookTabId = null;
  let latestStatus = null;
  const core = globalThis.__FFFC_CORE__;

  function normalizeSettings(stored = {}) {
    const normalized = {
      displayMode: ["hide", "collapse", "debug"].includes(stored.displayMode)
        ? stored.displayMode
        : stored.debugMode === true
          ? "debug"
          : DEFAULTS.displayMode
    };
    for (const key of checkboxIds) {
      normalized[key] =
        typeof stored[key] === "boolean" ? stored[key] : DEFAULTS[key];
    }
    return normalized;
  }

  function setForm(stored) {
    const settings = normalizeSettings(stored);
    for (const id of checkboxIds) {
      document.getElementById(id).checked = settings[id];
    }
    const mode = document.querySelector(
      `input[name="displayMode"][value="${settings.displayMode}"]`
    );
    if (mode) {
      mode.checked = true;
    }
  }

  function setButtonsEnabled(enabled) {
    for (const button of pageActionButtons) {
      button.disabled = !enabled;
    }
  }

  function isFacebookUrl(value) {
    return FACEBOOK_URL_PATTERN.test(String(value || ""));
  }

  function saveCheckbox(event) {
    chrome.storage.sync.set({
      [event.target.id]: event.target.checked
    });
    window.setTimeout(refreshStatus, 120);
  }

  function saveMode(event) {
    const displayMode = event.target.value;
    chrome.storage.sync.set({
      displayMode,
      debugMode: displayMode === "debug"
    });
    window.setTimeout(refreshStatus, 120);
  }

  function setMetric(id, value) {
    document.getElementById(id).textContent = String(value ?? 0);
  }

  function friendlyCode(code) {
    return String(code)
      .replace(/^category-/, "")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function renderReasons(status) {
    reasonList.replaceChildren();
    const reasons = Object.entries(status.current?.byReason || {})
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3);
    if (!reasons.length) {
      const item = document.createElement("li");
      item.textContent = "No detector reasons recorded yet.";
      reasonList.appendChild(item);
      return;
    }

    for (const [reason, count] of reasons) {
      const item = document.createElement("li");
      item.textContent = `${friendlyCode(reason)}: ${count}`;
      reasonList.appendChild(item);
    }
  }

  function renderStatus(status) {
    latestStatus = status;
    const contentVersion = status.runtime?.contentScriptVersion || "unknown";
    const runtimeCurrent = contentVersion === EXTENSION_VERSION;
    reloadFacebookButton.hidden = runtimeCurrent;
    surfaceBadge.textContent = status.surface || "Facebook";
    statusText.textContent = runtimeCurrent
      ? `${status.current?.ad || 0} Ad, ` +
        `${status.current?.sponsored || 0} Sponsored, ` +
        `${status.current?.suggested || 0} Suggested, ` +
        `${status.current?.reel || 0} Reels, ` +
        `${status.current?.activity || 0} activity-post and ` +
        `${status.current?.wordFilter || 0} custom-word matches detected.`
      : `Installed v${EXTENSION_VERSION}, but this Facebook tab is running ` +
        `content ${contentVersion}. Reload it before testing.`;
    if (!runtimeCurrent) {
      surfaceBadge.textContent = "Reload required";
    }
    setMetric("currentAd", status.current?.ad);
    setMetric("currentSponsored", status.current?.sponsored);
    setMetric("currentSuggested", status.current?.suggested);
    setMetric("currentReels", status.current?.reel);
    setMetric("currentActivity", status.current?.activity);
    setMetric("currentWordFilters", status.current?.wordFilter);
    setMetric("currentAiContent", status.current?.aiContent);
    setMetric("sessionMatches", status.session?.uniqueMatches);
    setMetric("storyCandidates", status.health?.storyCandidatesNow);
    setMetric(
      "headerCandidatesChecked",
      status.health?.headerCandidatesChecked
    );
    setMetric(
      "nestedObjectCandidates",
      status.health?.nestedObjectCandidates
    );
    setMetric(
      "scrambledCandidates",
      status.health?.scrambledHeaderCandidates
    );
    setMetric("ctaButtonMatches", status.health?.ctaButtonMarkerMatches);
    setMetric("glyphMatches", status.health?.glyphDecodeMatches);
    setMetric("directLabelMatches", status.health?.directAdLabelMatches);
    setMetric("adLinkSignals", status.health?.disclosureLinkMatches);
    setMetric(
      "suggestionHeaderActions",
      status.health?.suggestionHeaderActionMatches
    );
    setMetric(
      "recommendationPairs",
      status.health?.recommendationPairMatches
    );
    setMetric("sidebarModules", status.health?.rightRailSponsoredModules);
    setMetric(
      "suggestedGroupsModules",
      status.health?.rightRailSuggestedGroupsModules
    );
    setMetric(
      "groupChatsModules",
      status.health?.rightRailGroupChatsModules
    );
    setMetric("storiesTrayMatches", status.health?.storiesTrayMatches);
    setMetric(
      "decoyStringsRejected",
      status.health?.rawDecoyStringsRejected
    );
    setMetric(
      "reconciliationPasses",
      status.health?.reconciliationPasses
    );
    setMetric("postsScanned", status.health?.postsScanned);
    renderReasons(status);
    setButtonsEnabled(runtimeCurrent);
  }

  function showDisconnected(message) {
    activeFacebookTabId = null;
    latestStatus = null;
    reloadFacebookButton.hidden = true;
    statusText.textContent = message;
    surfaceBadge.textContent = "Not connected";
    for (const id of [
      "currentAd",
      "currentSponsored",
      "currentSuggested",
      "currentReels",
      "currentActivity",
      "currentWordFilters",
      "currentAiContent",
      "sessionMatches",
      "storyCandidates",
      "headerCandidatesChecked",
      "nestedObjectCandidates",
      "scrambledCandidates",
      "ctaButtonMatches",
      "glyphMatches",
      "directLabelMatches",
      "adLinkSignals",
      "suggestionHeaderActions",
      "recommendationPairs",
      "sidebarModules",
      "suggestedGroupsModules",
      "groupChatsModules",
      "storiesTrayMatches",
      "decoyStringsRejected",
      "reconciliationPasses",
      "postsScanned"
    ]) {
      document.getElementById(id).textContent = "—";
    }
    reasonList.replaceChildren();
    setButtonsEnabled(false);
  }

  function showConnecting() {
    latestStatus = null;
    statusText.textContent = "Connecting to this Facebook tab…";
    surfaceBadge.textContent = "Connecting";
    setButtonsEnabled(false);
  }

  function runtimeErrorMessage(fallback) {
    return chrome.runtime.lastError?.message || fallback;
  }

  function sendStatusRequest(tabId, callback) {
    chrome.tabs.sendMessage(
      tabId,
      { type: "fffc:get-status" },
      (response) => {
        const error = chrome.runtime.lastError;
        callback(error ? null : response, error?.message || "");
      }
    );
  }

  function injectIsolatedWorld(tabId, callback) {
    chrome.scripting.insertCSS(
      {
        target: { tabId },
        files: ["content.css"]
      },
      () => {
        const cssError = runtimeErrorMessage("");
        if (cssError) {
          callback(cssError);
          return;
        }

        chrome.scripting.executeScript(
          {
            target: { tabId },
            files: ["core.js", "content.js"]
            // Chrome 109 compatibility: isolated execution is the API default.
          },
          () => {
            callback(runtimeErrorMessage(""));
          }
        );
      }
    );
  }

  function bootstrapFacebookTab(tabId, callback) {
    injectIsolatedWorld(tabId, (isolatedError) => {
      if (isolatedError) {
        callback(isolatedError);
        return;
      }
      callback("");
    });
  }

  function connectToFacebookTab(tab) {
    if (!tab?.id) {
      showDisconnected("No active browser tab was found.");
      return;
    }
    if (!isFacebookUrl(tab.url)) {
      showDisconnected("Open a Facebook tab, then open this popup again.");
      return;
    }

    activeFacebookTabId = tab.id;
    showConnecting();
    sendStatusRequest(tab.id, (response) => {
      if (response) {
        renderStatus(response);
        return;
      }

      statusText.textContent = "Starting the Facebook testing helper…";
      bootstrapFacebookTab(tab.id, (injectionError) => {
        if (injectionError) {
          showDisconnected(
            "Could not start on Facebook. Check extension site access."
          );
          actionMessage.textContent = `Connection error: ${injectionError}`;
          return;
        }

        window.setTimeout(() => {
          sendStatusRequest(tab.id, (retryResponse, retryError) => {
            if (!retryResponse) {
              showDisconnected(
                "Could not connect to Facebook after starting the helper."
              );
              actionMessage.textContent =
                `Connection error: ${retryError || "No response from page"}`;
              return;
            }
            renderStatus(retryResponse);
            actionMessage.textContent =
              "Facebook connection restored for this tab.";
          });
        }, 250);
      });
    });
  }

  function sendPageMessage(type, callback) {
    if (!activeFacebookTabId) {
      showDisconnected("Open Facebook and reload the page.");
      return;
    }
    chrome.tabs.sendMessage(
      activeFacebookTabId,
      { type },
      (response) => {
        if (chrome.runtime.lastError || !response) {
          showDisconnected("Reload Facebook to start the testing build.");
          return;
        }
        callback(response);
      }
    );
  }

  function refreshStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      connectToFacebookTab(tab);
    });
  }

  function exportDiagnostics() {
    if (!latestStatus) {
      actionMessage.textContent = "No Facebook diagnostics are available yet.";
      return;
    }

    const report = core.buildDiagnosticReport(
      EXTENSION_VERSION,
      latestStatus
    );
    const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], {
      type: "application/json"
    });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = report.generatedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    link.href = objectUrl;
    link.download = `feed-filter-diagnostics-${stamp}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    actionMessage.textContent = "Sanitized diagnostics exported.";
  }

  function captureDom() {
    sendPageMessage("fffc:capture-dom", (response) => {
      if (response.error) {
        actionMessage.textContent = `DOM capture failed: ${response.error}`;
        return;
      }
      const blob = new Blob([response.text], { type: "text/plain" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d+Z$/, "Z");
      link.href = objectUrl;
      link.download = `feed-filter-dom-capture-${stamp}.txt`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      const fallbackNote = response.meta?.fallbackBlocksCaptured
        ? ` Normal detection found nothing, so a fallback capture (${response.meta.fallbackBlocksCaptured} block(s)) was used instead — worth flagging when you report this.`
        : "";
      actionMessage.textContent =
        `DOM capture saved (${response.meta?.storiesCaptured || 0} stories).` +
        fallbackNote +
        " Review before sharing — it can contain visible post text and names.";
    });
  }

  function revealAll() {
    sendPageMessage("fffc:reveal-all", (response) => {
      renderStatus(response.status);
      actionMessage.textContent =
        `${response.changed || 0} matched posts revealed on this page.`;
    });
  }

  function reapply() {
    sendPageMessage("fffc:reapply", (response) => {
      renderStatus(response.status);
      actionMessage.textContent =
        `Filtering reapplied to ${response.changed || 0} revealed posts.`;
    });
  }

  function reloadFacebook() {
    if (!activeFacebookTabId) {
      return;
    }
    chrome.tabs.reload(activeFacebookTabId, () => {
      void chrome.runtime.lastError;
      window.close();
    });
  }

  for (const id of checkboxIds) {
    document.getElementById(id).addEventListener("change", saveCheckbox);
  }
  for (const input of document.querySelectorAll(
    "input[name='displayMode']"
  )) {
    input.addEventListener("change", saveMode);
  }
  document
    .getElementById("exportDiagnostics")
    .addEventListener("click", exportDiagnostics);
  document
    .getElementById("exportDomCapture")
    .addEventListener("click", captureDom);
  document.getElementById("revealAll").addEventListener("click", revealAll);
  document.getElementById("reapply").addEventListener("click", reapply);
  reloadFacebookButton.addEventListener("click", reloadFacebook);
  document.getElementById("openOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  setButtonsEnabled(false);
  chrome.storage.sync.get(STORAGE_KEYS, setForm);
  refreshStatus();
})();
