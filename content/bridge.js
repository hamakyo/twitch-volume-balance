(function initializeExtensionBridge() {
  "use strict";

  const helpers = globalThis.TwitchVolumeBalance;
  const storage = globalThis.TwitchVolumeStorage;
  const CONFIG_EVENT = "twitch-volume-balance:config";
  const STATUS_EVENT = "twitch-volume-balance:status";
  const READY_EVENT = "twitch-volume-balance:ready";
  const STORAGE_DEFAULTS = { enabled: true, gains: {} };
  let channel = null;
  let settings = { ...STORAGE_DEFAULTS, gains: {} };
  let engine = { connected: false, contextState: "unknown", error: null, videoCount: 0, level: 0 };
  let metering = false;
  let lastUrl = location.href;
  let routeStartedAt = Date.now();
  let identity = helpers.resolvePageIdentity(lastUrl, document, false);
  let identityRefreshRunning = false;
  const ARCHIVE_FALLBACK_DELAY_MS = 5000;

  function identitySignature(value) {
    return [value.key, value.route, value.resolution, value.videoId].join(":");
  }

  function logIdentity(value) {
    const detail = {
      route: value.route,
      resolution: value.resolution,
      channel: value.key,
      videoId: value.videoId
    };
    const logger = value.resolution === "vod-fallback" ? console.warn : console.info;
    logger("[Twitch Volume Balance] 配信者の検出状態", detail);
  }

  function currentGain() {
    return channel ? helpers.clampGain(settings.gains[channel] ?? 1) : 1;
  }

  function sendConfiguration() {
    window.dispatchEvent(new CustomEvent(CONFIG_EVENT, {
      detail: JSON.stringify({
        enabled: settings.enabled,
        gain: currentGain(),
        channel,
        metering
      })
    }));
  }

  function publicStatus() {
    return {
      ok: true,
      channel,
      channelLabel: identity.label,
      enabled: settings.enabled,
      gain: currentGain(),
      engine,
      diagnostics: {
        route: identity.route,
        resolution: identity.resolution,
        videoId: identity.videoId
      }
    };
  }

  async function migrateArchiveFallback(previous, next) {
    if (previous.resolution !== "vod-fallback" || next.resolution !== "dom") return;
    if (!(previous.key in settings.gains) || next.key in settings.gains) return;
    settings = await storage.setChannelGain(next.key, settings.gains[previous.key]);
    settings = await storage.removeChannel(previous.key);
  }

  async function refreshIdentity() {
    if (identityRefreshRunning) return;
    identityRefreshRunning = true;
    try {
      const nextUrl = location.href;
      if (nextUrl !== lastUrl) {
        lastUrl = nextUrl;
        routeStartedAt = Date.now();
      }
      const allowVideoFallback = Date.now() - routeStartedAt >= ARCHIVE_FALLBACK_DELAY_MS;
      const nextIdentity = helpers.resolvePageIdentity(nextUrl, document, allowVideoFallback);
      if (identitySignature(nextIdentity) === identitySignature(identity)) return;

      const previous = identity;
      await migrateArchiveFallback(previous, nextIdentity);
      identity = nextIdentity;
      channel = identity.key;
      logIdentity(identity);
      sendConfiguration();
    } finally {
      identityRefreshRunning = false;
    }
  }

  async function loadSettings() {
    settings = await storage.loadSettings();
    identity = helpers.resolvePageIdentity(location.href, document, false);
    channel = identity.key;
    logIdentity(identity);
    sendConfiguration();
  }

  async function saveGain(value) {
    if (!channel) throw new Error("このページでは配信者を特定できません。");
    const gain = helpers.clampGain(value);
    settings = await storage.setChannelGain(channel, gain);
    sendConfiguration();
    return publicStatus();
  }

  async function resetChannel() {
    if (!channel) return publicStatus();
    settings = await storage.removeChannel(channel);
    sendConfiguration();
    return publicStatus();
  }

  async function setEnabled(value) {
    settings = await storage.saveSettings({ enabled: Boolean(value) });
    sendConfiguration();
    return publicStatus();
  }

  function setMetering(value) {
    metering = Boolean(value);
    sendConfiguration();
    return publicStatus();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;

    let operation;
    switch (message.type) {
      case "GET_STATUS": operation = Promise.resolve(publicStatus()); break;
      case "SET_GAIN": operation = saveGain(message.gain); break;
      case "ADJUST_GAIN": operation = saveGain(currentGain() + Number(message.delta || 0)); break;
      case "SET_ENABLED": operation = setEnabled(message.enabled); break;
      case "TOGGLE_ENABLED": operation = setEnabled(!settings.enabled); break;
      case "RESET_CHANNEL": operation = resetChannel(); break;
      case "START_METERING": operation = Promise.resolve(setMetering(true)); break;
      case "STOP_METERING": operation = Promise.resolve(setMetering(false)); break;
      default: return false;
    }

    operation
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  });

  window.addEventListener(STATUS_EVENT, (event) => {
    let detail = null;
    try {
      detail = event instanceof CustomEvent && typeof event.detail === "string"
        ? JSON.parse(event.detail)
        : null;
    } catch {}
    if (!detail || typeof detail !== "object") return;
    engine = {
      connected: Boolean(detail.connected),
      contextState: typeof detail.contextState === "string" ? detail.contextState : "unknown",
      error: typeof detail.error === "string" ? detail.error : null,
      videoCount: Number.isFinite(detail.videoCount) ? detail.videoCount : 0,
      level: Number.isFinite(detail.level) ? Math.min(1, Math.max(0, detail.level)) : 0
    };
  });

  window.addEventListener(READY_EVENT, sendConfiguration);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue !== false;
    if (changes.gains) settings.gains = changes.gains.newValue || {};
    sendConfiguration();
  });

  setInterval(() => refreshIdentity().catch((error) => {
    console.warn("[Twitch Volume Balance] 配信者情報の更新に失敗しました", error);
  }), 750);

  loadSettings().catch(() => {});
})();
