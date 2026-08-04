const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("../lib/channel.js"), "utf8");
const context = { URL };
context.globalThis = context;
vm.runInNewContext(source, context);
const { getChannelFromDocument, getChannelFromUrl, getVideoIdFromUrl, clampGain, normalizeChannel } = context.TwitchVolumeBalance;

assert.equal(getChannelFromUrl("https://www.twitch.tv/some_streamer"), "some_streamer");
assert.equal(getChannelFromUrl("https://www.twitch.tv/Some_Streamer/videos"), "some_streamer");
assert.equal(getChannelFromUrl("https://www.twitch.tv/directory/category/music"), null);
assert.equal(getChannelFromUrl("https://www.twitch.tv/videos/123456"), null);
assert.equal(getVideoIdFromUrl("https://www.twitch.tv/videos/123456"), "123456");
assert.equal(getVideoIdFromUrl("https://m.twitch.tv/videos/987654?t=1h"), "987654");
assert.equal(getVideoIdFromUrl("https://player.twitch.tv/?video=v24680&parent=example.com"), "24680");
assert.equal(getVideoIdFromUrl("https://www.twitch.tv/some_streamer"), null);
assert.equal(getChannelFromUrl("https://www.twitch.tv/%E0%A4%A"), null);
assert.equal(getChannelFromUrl("https://player.twitch.tv/?channel=Some_Streamer&parent=example.com"), "some_streamer");
assert.equal(getChannelFromUrl("https://example.com/some_streamer"), null);
assert.equal(normalizeChannel(" Valid_Name "), "valid_name");
assert.equal(normalizeChannel("invalid-name"), null);

const channelLink = { getAttribute: (name) => name === "href" ? "/archive_streamer" : null };
const channelHeading = { closest: () => channelLink, querySelector: () => null };
const fakeDocument = {
  querySelectorAll: (selector) => selector === "main h1" ? [channelHeading] : []
};
assert.equal(getChannelFromDocument(fakeDocument), "archive_streamer");
assert.equal(getChannelFromDocument({ querySelectorAll: () => [] }), null);
assert.equal(clampGain(-1), 0);
assert.equal(clampGain(1.256), 1.26);
assert.equal(clampGain(9), 2);

console.log("channel helpers: ok");
