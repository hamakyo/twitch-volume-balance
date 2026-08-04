(function exposeChannelHelpers(root) {
  "use strict";

  const RESERVED_ROUTES = new Set([
    "", "about", "collections", "creatorcamp", "dashboard", "directory", "downloads",
    "drops", "following", "friends", "inventory", "jobs", "legal", "login", "messages",
    "moderator", "p", "partners", "payments", "prime", "privacy", "products", "search",
    "security", "settings", "signup", "store", "subscriptions", "team", "turbo", "videos",
    "wallet"
  ]);

  function normalizeChannel(value) {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase();
    return /^[a-z0-9_]{1,25}$/.test(normalized) ? normalized : null;
  }

  function getChannelFromUrl(urlValue) {
    let url;
    try {
      url = new URL(urlValue);
    } catch {
      return null;
    }

    if (url.hostname === "player.twitch.tv") {
      return normalizeChannel(url.searchParams.get("channel") || "");
    }

    if (url.hostname !== "www.twitch.tv" && url.hostname !== "m.twitch.tv") {
      return null;
    }

    let firstSegment;
    try {
      firstSegment = decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] || "").toLowerCase();
    } catch {
      return null;
    }
    if (RESERVED_ROUTES.has(firstSegment)) return null;
    return normalizeChannel(firstSegment);
  }

  function getVideoIdFromUrl(urlValue) {
    let url;
    try {
      url = new URL(urlValue);
    } catch {
      return null;
    }

    if (url.hostname === "player.twitch.tv") {
      const video = url.searchParams.get("video") || "";
      const match = video.match(/^v?(\d{1,20})$/i);
      return match ? match[1] : null;
    }

    if (url.hostname !== "www.twitch.tv" && url.hostname !== "m.twitch.tv") return null;
    const match = url.pathname.match(/^\/videos\/(\d{1,20})(?:\/|$)/i);
    return match ? match[1] : null;
  }

  function getVideoStorageKey(videoId) {
    const normalized = String(videoId || "").trim();
    return /^\d{1,20}$/.test(normalized) ? `vod_${normalized}` : null;
  }

  function getChannelFromLink(element) {
    const link = element?.matches?.("a[href]")
      ? element
      : element?.closest?.("a[href]") || element?.querySelector?.("a[href]");
    const href = link?.getAttribute?.("href");
    if (!href) return null;

    try {
      return getChannelFromUrl(new URL(href, "https://www.twitch.tv").href);
    } catch {
      return null;
    }
  }

  function getChannelFromStructuredValue(value, depth = 0) {
    if (depth > 5 || value == null) return null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const channel = getChannelFromStructuredValue(item, depth + 1);
        if (channel) return channel;
      }
      return null;
    }
    if (typeof value === "string") {
      try {
        return getChannelFromUrl(new URL(value, "https://www.twitch.tv").href);
      } catch {
        return null;
      }
    }
    if (typeof value !== "object") return null;

    for (const key of ["url", "sameAs", "@id"]) {
      const channel = getChannelFromStructuredValue(value[key], depth + 1);
      if (channel) return channel;
    }
    return normalizeChannel(value.name || "");
  }

  function getChannelFromDocument(root) {
    if (!root || typeof root.querySelectorAll !== "function") return null;
    const selectors = [
      'main [data-a-target="video-info-username"]',
      'main [data-test-selector="video-info-username"]',
      '[data-a-target="video-info"] h1',
      "main h1"
    ];

    for (const selector of selectors) {
      for (const element of root.querySelectorAll(selector)) {
        const channel = getChannelFromLink(element);
        if (channel) return channel;
      }
    }

    for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try {
        data = JSON.parse(script.textContent || "");
      } catch {
        continue;
      }
      for (const field of ["author", "creator"]) {
        const channel = getChannelFromStructuredValue(data?.[field]);
        if (channel) return channel;
      }
    }
    return null;
  }

  function resolvePageIdentity(urlValue, documentRoot, allowVideoFallback = false) {
    const channel = getChannelFromUrl(urlValue);
    if (channel) {
      return { key: channel, label: channel, route: "channel", resolution: "url", videoId: null };
    }

    const videoId = getVideoIdFromUrl(urlValue);
    if (!videoId) {
      return { key: null, label: null, route: "other", resolution: "none", videoId: null };
    }

    const archiveChannel = getChannelFromDocument(documentRoot);
    if (archiveChannel) {
      return { key: archiveChannel, label: archiveChannel, route: "archive", resolution: "dom", videoId };
    }

    const fallbackKey = allowVideoFallback ? getVideoStorageKey(videoId) : null;
    return {
      key: fallbackKey,
      label: fallbackKey ? `アーカイブ ${videoId}` : null,
      route: "archive",
      resolution: fallbackKey ? "vod-fallback" : "pending",
      videoId
    };
  }

  function clampGain(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 1;
    return Math.min(2, Math.max(0, Math.round(numeric * 100) / 100));
  }

  root.TwitchVolumeBalance = Object.freeze({
    clampGain,
    getChannelFromDocument,
    getChannelFromUrl,
    getVideoIdFromUrl,
    getVideoStorageKey,
    normalizeChannel,
    resolvePageIdentity
  });
})(globalThis);
