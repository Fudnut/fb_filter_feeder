(function initOptions() {
  "use strict";

  const core = globalThis.__FFFC_CORE__;
  const toggle = document.getElementById("enableWordFilters");
  const input = document.getElementById("customWordFilters");
  const count = document.getElementById("wordFilterCount");
  const status = document.getElementById("saveStatus");

  function saveCheckboxKey(event) {
    chrome.storage.sync.set(
      { [event.target.id]: event.target.checked },
      () => {
        status.textContent = "Settings saved.";
      }
    );
  }

  function setAllKeys(keys, enabled, message) {
    const update = Object.fromEntries(keys.map((key) => [key, enabled]));
    chrome.storage.sync.set(update, () => {
      for (const key of keys) {
        document.getElementById(key).checked = enabled;
      }
      status.textContent = message;
    });
  }

  function checkedValue(stored, key, fallback) {
    return typeof stored[key] === "boolean" ? stored[key] : fallback;
  }

  document.getElementById("extensionVersion").textContent =
    `v${chrome.runtime.getManifest().version_name || chrome.runtime.getManifest().version}`;

  document
    .getElementById("closeOptions")
    .addEventListener("click", () => window.close());

  const tabButtons = document.querySelectorAll(".tab-button");
  for (const button of tabButtons) {
    button.addEventListener("click", () => {
      for (const other of tabButtons) {
        const selected = other === button;
        other.setAttribute("aria-selected", String(selected));
        document.getElementById(other.getAttribute("aria-controls")).hidden =
          !selected;
      }
    });
  }

  function normalizedFilters() {
    return core.normalizeCustomWordFilters(input.value);
  }

  function renderCount(filters = normalizedFilters()) {
    count.textContent =
      `${filters.length} ${filters.length === 1 ? "filter" : "filters"}`;
  }

  function saveFilters() {
    const filters = normalizedFilters();
    const customWordFilters = filters.join("\n");
    input.value = customWordFilters;
    renderCount(filters);
    chrome.storage.sync.set({ customWordFilters }, () => {
      status.textContent = chrome.runtime.lastError
        ? `Could not save: ${chrome.runtime.lastError.message}`
        : filters.length
          ? `${filters.length} word filters saved.`
          : "Word filter list cleared.";
    });
  }

  function clearFilters() {
    input.value = "";
    chrome.storage.sync.set({ customWordFilters: "" }, () => {
      renderCount([]);
      status.textContent = "Word filter list cleared.";
    });
  }

  function saveToggle() {
    chrome.storage.sync.set({ enableWordFilters: toggle.checked }, () => {
      status.textContent = toggle.checked
        ? "Custom word filters enabled."
        : "Custom word filters disabled.";
    });
  }

  chrome.storage.sync.get(
    [
      "enableWordFilters",
      "filterAiContent",
      "marketplaceDateFilter",
      "customWordFilters",
      ...core.ACTIVITY_FILTER_KEYS,
      ...core.SUGGESTED_SUBCATEGORY_KEYS
    ],
    (stored) => {
      const filters = core.normalizeCustomWordFilters(
        stored.customWordFilters
      );
      input.value = filters.join("\n");
      toggle.checked = stored.enableWordFilters === true;
      renderCount(filters);
      for (const key of core.ACTIVITY_FILTER_KEYS) {
        const activityInput = document.getElementById(key);
        activityInput.checked = checkedValue(stored, key, false);
        activityInput.addEventListener("change", saveCheckboxKey);
      }
      for (const key of core.SUGGESTED_SUBCATEGORY_KEYS) {
        const suggestedInput = document.getElementById(key);
        suggestedInput.checked = checkedValue(stored, key, true);
        suggestedInput.addEventListener("change", saveCheckboxKey);
      }
      const aiContentInput = document.getElementById("filterAiContent");
      aiContentInput.checked = checkedValue(stored, "filterAiContent", false);
      aiContentInput.addEventListener("change", saveCheckboxKey);

      const marketplaceValue = ["off", "1", "7", "30"].includes(
        stored.marketplaceDateFilter
      )
        ? stored.marketplaceDateFilter
        : "off";
      for (const marketplaceInput of document.querySelectorAll(
        "input[name='marketplaceDateFilter']"
      )) {
        marketplaceInput.checked = marketplaceInput.value === marketplaceValue;
        marketplaceInput.addEventListener("change", (event) => {
          chrome.storage.sync.set(
            { marketplaceDateFilter: event.target.value },
            () => {
              status.textContent = "Marketplace filter preference saved.";
            }
          );
        });
      }
    }
  );

  document
    .getElementById("enableAllActivity")
    .addEventListener("click", () =>
      setAllKeys(
        core.ACTIVITY_FILTER_KEYS,
        true,
        "All activity post filters enabled."
      )
    );
  document
    .getElementById("disableAllActivity")
    .addEventListener("click", () =>
      setAllKeys(
        core.ACTIVITY_FILTER_KEYS,
        false,
        "All activity post filters disabled."
      )
    );
  document
    .getElementById("enableAllSuggested")
    .addEventListener("click", () =>
      setAllKeys(
        core.SUGGESTED_SUBCATEGORY_KEYS,
        true,
        "All Suggested subcategories enabled."
      )
    );
  document
    .getElementById("disableAllSuggested")
    .addEventListener("click", () =>
      setAllKeys(
        core.SUGGESTED_SUBCATEGORY_KEYS,
        false,
        "All Suggested subcategories disabled."
      )
    );

  input.addEventListener("input", () => renderCount());
  toggle.addEventListener("change", saveToggle);
  document
    .getElementById("saveWordFilters")
    .addEventListener("click", saveFilters);
  document
    .getElementById("clearWordFilters")
    .addEventListener("click", clearFilters);
})();
