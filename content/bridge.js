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

  function resolveChannel() {
    const fromUrl = helpers.getChannelFromUrl(location.href);
    if (fromUrl) return fromUrl;
    if (!helpers.getVideoIdFromUrl(location.href)) return null;
    return helpers.getChannelFromDocument(document);
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
      enabled: settings.enabled,
      gain: currentGain(),
      engine
    };
  }

  async function loadSettings() {
    settings = await storage.loadSettings();
    channel = resolveChannel();
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

  setInterval(() => {
    const nextUrl = location.href;
    const nextChannel = resolveChannel();
    if (nextUrl === lastUrl && nextChannel === channel) return;
    lastUrl = nextUrl;
    channel = nextChannel;
    sendConfiguration();
  }, 750);

  loadSettings().catch(() => {});
})();
