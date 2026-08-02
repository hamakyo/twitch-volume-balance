(function initializeExtensionBridge() {
  "use strict";

  const helpers = globalThis.TwitchVolumeBalance;
  const CONFIG_EVENT = "twitch-volume-balance:config";
  const STATUS_EVENT = "twitch-volume-balance:status";
  const READY_EVENT = "twitch-volume-balance:ready";
  const STORAGE_DEFAULTS = { enabled: true, gains: {} };
  let channel = null;
  let settings = { ...STORAGE_DEFAULTS, gains: {} };
  let engine = { connected: false, contextState: "unknown", error: null, videoCount: 0 };
  let lastUrl = location.href;

  function currentGain() {
    return channel ? helpers.clampGain(settings.gains[channel] ?? 1) : 1;
  }

  function sendConfiguration() {
    window.dispatchEvent(new CustomEvent(CONFIG_EVENT, {
      detail: JSON.stringify({
        enabled: settings.enabled,
        gain: currentGain(),
        channel
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
    const stored = await chrome.storage.local.get(["enabled", "gains"]);
    settings = {
      enabled: stored.enabled !== false,
      gains: stored.gains && typeof stored.gains === "object" ? stored.gains : {}
    };
    channel = helpers.getChannelFromUrl(location.href);
    sendConfiguration();
  }

  async function saveGain(value) {
    if (!channel) throw new Error("このページでは配信者を特定できません。");
    const gain = helpers.clampGain(value);
    settings.gains = { ...settings.gains, [channel]: gain };
    await chrome.storage.local.set({ gains: settings.gains });
    sendConfiguration();
    return publicStatus();
  }

  async function resetChannel() {
    if (!channel) return publicStatus();
    const nextGains = { ...settings.gains };
    delete nextGains[channel];
    settings.gains = nextGains;
    await chrome.storage.local.set({ gains: nextGains });
    sendConfiguration();
    return publicStatus();
  }

  async function setEnabled(value) {
    settings.enabled = Boolean(value);
    await chrome.storage.local.set({ enabled: settings.enabled });
    sendConfiguration();
    return publicStatus();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;

    let operation;
    switch (message.type) {
      case "GET_STATUS": operation = Promise.resolve(publicStatus()); break;
      case "SET_GAIN": operation = saveGain(message.gain); break;
      case "SET_ENABLED": operation = setEnabled(message.enabled); break;
      case "RESET_CHANNEL": operation = resetChannel(); break;
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
      videoCount: Number.isFinite(detail.videoCount) ? detail.videoCount : 0
    };
  });

  window.addEventListener(READY_EVENT, sendConfiguration);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue !== false;
    if (changes.gains) settings.gains = changes.gains.newValue || {};
    sendConfiguration();
  });

  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    channel = helpers.getChannelFromUrl(lastUrl);
    sendConfiguration();
  }, 750);

  loadSettings().catch(() => {});
})();
