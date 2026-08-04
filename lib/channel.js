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
      const match = video.match(/^v?(\d+)$/i);
      return match ? match[1] : null;
    }

    if (url.hostname !== "www.twitch.tv" && url.hostname !== "m.twitch.tv") return null;
    const match = url.pathname.match(/^\/videos\/(\d+)(?:\/|$)/i);
    return match ? match[1] : null;
  }

  function getChannelFromDocument(root) {
    if (!root || typeof root.querySelectorAll !== "function") return null;
    const selectors = [
      'main [data-a-target="video-info-username"]',
      "main h1"
    ];

    for (const selector of selectors) {
      for (const element of root.querySelectorAll(selector)) {
        const link = element.closest?.("a[href]") || element.querySelector?.("a[href]");
        const href = link?.getAttribute?.("href");
        if (!href) continue;

        let absoluteUrl;
        try {
          absoluteUrl = new URL(href, "https://www.twitch.tv").href;
        } catch {
          continue;
        }
        const channel = getChannelFromUrl(absoluteUrl);
        if (channel) return channel;
      }
    }
    return null;
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
    normalizeChannel
  });
})(globalThis);
