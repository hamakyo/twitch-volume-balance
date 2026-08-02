(function initializeCommandHandler() {
  "use strict";

  const messages = {
    "increase-volume": { type: "ADJUST_GAIN", delta: 0.05 },
    "decrease-volume": { type: "ADJUST_GAIN", delta: -0.05 },
    "reset-volume": { type: "RESET_CHANNEL" },
    "toggle-enabled": { type: "TOGGLE_ENABLED" }
  };

  async function showBadge(tabId, status) {
    const text = status.enabled ? String(Math.round(status.gain * 100)) : "OFF";
    await chrome.action.setBadgeBackgroundColor({ tabId, color: status.enabled ? "#9147ff" : "#5f5968" });
    await chrome.action.setBadgeText({ tabId, text });
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {}), 1600);
  }

  chrome.commands.onCommand.addListener(async (command) => {
    const message = messages[command];
    if (!message) return;

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return;

    try {
      const response = await chrome.tabs.sendMessage(tab.id, message);
      if (response?.ok) await showBadge(tab.id, response);
    } catch {
      // Twitch以外のタブや、再読み込み前のタブでは何もしない。
    }
  });
})();
