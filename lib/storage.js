(function exposeStorageHelpers(root) {
  "use strict";

  const MIGRATION_VERSION = 1;
  const MAX_CHANNELS = 150;
  const CHANNEL_PATTERN = /^[a-z0-9_]{1,25}$/;

  function clampGain(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 1;
    return Math.min(2, Math.max(0, Math.round(numeric * 100) / 100));
  }

  function sanitizeGains(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const gains = {};
    for (const [channel, gain] of Object.entries(value)) {
      if (Object.keys(gains).length >= MAX_CHANNELS) break;
      const normalized = String(channel).trim().toLowerCase();
      if (CHANNEL_PATTERN.test(normalized)) gains[normalized] = clampGain(gain);
    }
    return gains;
  }

  function normalizeSettings(value) {
    return {
      enabled: value?.enabled !== false,
      gains: sanitizeGains(value?.gains)
    };
  }

  async function loadSettings() {
    const synced = await chrome.storage.sync.get(["enabled", "gains", "migrationVersion"]);
    if (synced.migrationVersion === MIGRATION_VERSION) return normalizeSettings(synced);

    const legacy = await chrome.storage.local.get(["enabled", "gains"]);
    const hasSyncedEnabled = Object.prototype.hasOwnProperty.call(synced, "enabled");
    const hasSyncedGains = Object.prototype.hasOwnProperty.call(synced, "gains");
    const migrated = normalizeSettings({
      enabled: hasSyncedEnabled ? synced.enabled : legacy.enabled,
      gains: hasSyncedGains ? synced.gains : legacy.gains
    });
    await chrome.storage.sync.set({ ...migrated, migrationVersion: MIGRATION_VERSION });
    return migrated;
  }

  async function saveSettings(partial) {
    const current = await loadSettings();
    const next = normalizeSettings({
      enabled: Object.prototype.hasOwnProperty.call(partial, "enabled") ? partial.enabled : current.enabled,
      gains: Object.prototype.hasOwnProperty.call(partial, "gains") ? partial.gains : current.gains
    });
    await chrome.storage.sync.set({ ...next, migrationVersion: MIGRATION_VERSION });
    return next;
  }

  async function setChannelGain(channel, gain) {
    const current = await loadSettings();
    const normalized = String(channel || "").trim().toLowerCase();
    if (!CHANNEL_PATTERN.test(normalized)) throw new Error("チャンネル名が正しくありません。");
    if (!(normalized in current.gains) && Object.keys(current.gains).length >= MAX_CHANNELS) {
      throw new Error(`同期できるチャンネルは${MAX_CHANNELS}件までです。`);
    }
    return saveSettings({ gains: { ...current.gains, [normalized]: clampGain(gain) } });
  }

  async function removeChannel(channel) {
    const current = await loadSettings();
    const nextGains = { ...current.gains };
    delete nextGains[channel];
    return saveSettings({ gains: nextGains });
  }

  root.TwitchVolumeStorage = Object.freeze({
    clampGain,
    loadSettings,
    maxChannels: MAX_CHANNELS,
    removeChannel,
    sanitizeGains,
    saveSettings,
    setChannelGain
  });
})(globalThis);
