(function initializeOptions() {
  "use strict";

  const list = document.querySelector("#list");
  const clearAll = document.querySelector("#clearAll");

  async function removeChannel(channel) {
    const { gains = {} } = await chrome.storage.local.get("gains");
    const next = { ...gains };
    delete next[channel];
    await chrome.storage.local.set({ gains: next });
  }

  async function render() {
    const { gains = {} } = await chrome.storage.local.get("gains");
    const entries = Object.entries(gains).sort(([a], [b]) => a.localeCompare(b));
    list.replaceChildren();
    clearAll.disabled = entries.length === 0;

    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "保存済みのチャンネルはありません";
      list.append(empty);
      return;
    }

    for (const [channel, gain] of entries) {
      const row = document.createElement("article");
      row.className = "row";

      const info = document.createElement("div");
      info.className = "channel";
      const name = document.createElement("strong");
      name.textContent = channel;
      const value = document.createElement("span");
      value.textContent = `音量補正 ${Math.round(Number(gain) * 100)}%`;
      info.append(name, value);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "削除";
      remove.addEventListener("click", async () => {
        await removeChannel(channel);
        render();
      });

      row.append(info, remove);
      list.append(row);
    }
  }

  clearAll.addEventListener("click", async () => {
    if (!confirm("保存済みのチャンネル設定をすべて削除しますか？")) return;
    await chrome.storage.local.set({ gains: {} });
    render();
  });

  chrome.storage.onChanged.addListener((_changes, areaName) => {
    if (areaName === "local") render();
  });
  render();
})();
