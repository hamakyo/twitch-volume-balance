const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  let commandListener = null;
  const sentMessages = [];
  const context = {
    setTimeout(callback) { callback(); },
    chrome: {
      commands: { onCommand: { addListener(listener) { commandListener = listener; } } },
      tabs: {
        async query() { return [{ id: 7 }]; },
        async sendMessage(tabId, message) {
          sentMessages.push({ tabId, message });
          return { ok: true, enabled: true, gain: 1.05 };
        }
      },
      action: {
        async setBadgeBackgroundColor() {},
        async setBadgeText() {}
      }
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../background.js"), "utf8"), context);
  assert.equal(typeof commandListener, "function");

  await commandListener("increase-volume");
  await commandListener("toggle-enabled");
  assert.equal(JSON.stringify(sentMessages), JSON.stringify([
    { tabId: 7, message: { type: "ADJUST_GAIN", delta: 0.05 } },
    { tabId: 7, message: { type: "TOGGLE_ENABLED" } }
  ]));
  console.log("keyboard command routing: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
