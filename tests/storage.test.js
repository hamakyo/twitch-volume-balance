const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function createArea(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(keys) {
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requested.filter((key) => key in data).map((key) => [key, data[key]]));
    },
    async set(values) {
      Object.assign(data, values);
    }
  };
}

(async () => {
  const sync = createArea();
  const local = createArea({
    enabled: false,
    gains: { Some_Streamer: 1.256, "invalid-name": 1.5 }
  });
  const context = { chrome: { storage: { sync, local } } };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(require.resolve("../lib/storage.js"), "utf8"), context);

  const storage = context.TwitchVolumeStorage;
  const migrated = await storage.loadSettings();
  assert.equal(migrated.enabled, false);
  assert.equal(JSON.stringify(migrated.gains), JSON.stringify({ some_streamer: 1.26 }));
  assert.equal(sync.data.migrationVersion, 1);

  const updated = await storage.setChannelGain("Another_Channel", 4);
  assert.equal(updated.gains.another_channel, 2);
  assert.equal(updated.gains.some_streamer, 1.26);

  const archiveUpdated = await storage.setChannelGain("vod_123456", 0.85);
  assert.equal(archiveUpdated.gains.vod_123456, 0.85);

  const removed = await storage.removeChannel("some_streamer");
  assert.equal("some_streamer" in removed.gains, false);

  const manyGains = Object.fromEntries(Array.from({ length: 151 }, (_, index) => [`channel_${index}`, 1]));
  const limited = await storage.saveSettings({ gains: manyGains });
  assert.equal(Object.keys(limited.gains).length, storage.maxChannels);
  await assert.rejects(() => storage.setChannelGain("new_channel", 1.2), /150件まで/);
  console.log("storage migration and updates: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
