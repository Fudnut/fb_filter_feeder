/*
 * Userscript stand-in for the small part of the extension API that
 * content.js uses. All settings live in one JSON blob under one key.
 * Works with sync GM_* (Tampermonkey, Violentmonkey) and async GM.*
 * (Userscripts app for Safari, Greasemonkey 4).
 */
const FFFC_STORE_KEY = "fffcSettings";

const fffcGM = (() => {
  const gm = typeof GM === "object" && GM ? GM : null;
  const syncGet = typeof GM_getValue === "function" ? GM_getValue : null;
  const syncSet = typeof GM_setValue === "function" ? GM_setValue : null;
  const syncStyle = typeof GM_addStyle === "function" ? GM_addStyle : null;
  return {
    get(key, fallback) {
      if (gm?.getValue) {
        return Promise.resolve(gm.getValue(key, fallback));
      }
      if (syncGet) {
        return Promise.resolve(syncGet(key, fallback));
      }
      return Promise.resolve(fallback);
    },
    set(key, value) {
      if (gm?.setValue) {
        return Promise.resolve(gm.setValue(key, value));
      }
      if (syncSet) {
        syncSet(key, value);
      }
      return Promise.resolve();
    },
    addStyle(css) {
      try {
        if (syncStyle) {
          syncStyle(css);
          return;
        }
        if (gm?.addStyle) {
          Promise.resolve(gm.addStyle(css)).catch(() => fallbackStyle(css));
          return;
        }
      } catch (_error) {
        // fall through to a plain <style> tag
      }
      fallbackStyle(css);
    },
    menu:
      typeof GM_registerMenuCommand === "function"
        ? GM_registerMenuCommand
        : null,
    valueListener:
      typeof GM_addValueChangeListener === "function"
        ? GM_addValueChangeListener
        : null
  };

  function fallbackStyle(css) {
    const style = document.createElement("style");
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }
})();

const chrome = (() => {
  let cache = {};
  const changeListeners = [];
  const messageListeners = [];

  function parse(raw) {
    if (raw && typeof raw === "object") {
      return { ...raw };
    }
    try {
      const value = JSON.parse(raw || "{}");
      return value && typeof value === "object" ? value : {};
    } catch (_error) {
      return {};
    }
  }

  function emit(changes) {
    if (!Object.keys(changes).length) {
      return;
    }
    setTimeout(() => {
      for (const listener of changeListeners) {
        try {
          listener(changes, "sync");
        } catch (error) {
          console.error("[FB Purity Feed Filter]", error);
        }
      }
    }, 0);
  }

  // Replace the cache with a fresh copy and report what differs.
  function adopt(next) {
    const changes = {};
    for (const key of new Set([...Object.keys(cache), ...Object.keys(next)])) {
      if (JSON.stringify(cache[key]) !== JSON.stringify(next[key])) {
        changes[key] = { oldValue: cache[key], newValue: next[key] };
      }
    }
    cache = next;
    emit(changes);
  }

  let loaded = fffcGM.get(FFFC_STORE_KEY, "{}").then((raw) => {
    cache = parse(raw);
  });

  // Pick up changes made in other tabs.
  if (fffcGM.valueListener) {
    fffcGM.valueListener(FFFC_STORE_KEY, (_name, _old, value, remote) => {
      if (remote) {
        adopt(parse(value));
      }
    });
  } else {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        loaded = fffcGM.get(FFFC_STORE_KEY, "{}").then((raw) => {
          adopt(parse(raw));
        });
      }
    });
  }

  function pick(keys) {
    if (keys == null) {
      return { ...cache };
    }
    const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    const result = {};
    for (const key of list) {
      if (key in cache) {
        result[key] = cache[key];
      } else if (keys && !Array.isArray(keys) && typeof keys === "object") {
        result[key] = keys[key];
      }
    }
    return result;
  }

  const sync = {
    get(keys, callback) {
      const done = loaded.then(() => pick(keys));
      if (typeof callback === "function") {
        done.then(callback);
        return undefined;
      }
      return done;
    },
    set(items, callback) {
      const done = loaded.then(() => {
        const changes = {};
        for (const [key, value] of Object.entries(items || {})) {
          if (JSON.stringify(cache[key]) !== JSON.stringify(value)) {
            changes[key] = { oldValue: cache[key], newValue: value };
          }
          cache[key] = value;
        }
        emit(changes);
        return fffcGM.set(FFFC_STORE_KEY, JSON.stringify(cache));
      });
      if (typeof callback === "function") {
        done.then(() => callback());
        return undefined;
      }
      return done;
    }
  };

  return {
    storage: {
      sync,
      onChanged: {
        addListener(listener) {
          changeListeners.push(listener);
        }
      }
    },
    runtime: {
      lastError: undefined,
      getManifest() {
        return { version: FFFC_VERSION };
      },
      onMessage: {
        addListener(listener) {
          messageListeners.push(listener);
        }
      },
      // Panel-side stand-in for chrome.tabs.sendMessage.
      sendMessage(message) {
        return new Promise((resolve) => {
          let answered = false;
          for (const listener of messageListeners) {
            listener(message, {}, (response) => {
              answered = true;
              resolve(response);
            });
            if (answered) {
              return;
            }
          }
          resolve(undefined);
        });
      }
    }
  };
})();
