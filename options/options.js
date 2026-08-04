(function initializeOptions() {
  "use strict";

  const storage = globalThis.TwitchVolumeStorage;
  const list = document.querySelector("#list");
  const clearAll = document.querySelector("#clearAll");
  const exportButton = document.querySelector("#exportSettings");
  const importButton = document.querySelector("#importSettings");
  const importFile = document.querySelector("#importFile");
  const message = document.querySelector("#message");

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("error", isError);
  }

  function displayName(storageKey) {
    const archive = storageKey.match(/^vod_(\d+)$/);
    return archive ? `アーカイブ ${archive[1]}` : storageKey;
  }

  async function render() {
    const { gains } = await storage.loadSettings();
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
      name.textContent = displayName(channel);
      const value = document.createElement("span");
      value.textContent = `音量補正 ${Math.round(Number(gain) * 100)}%`;
      info.append(name, value);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "削除";
      remove.addEventListener("click", async () => {
        await storage.removeChannel(channel);
        showMessage(`${channel} の設定を削除しました。`);
        render();
      });

      row.append(info, remove);
      list.append(row);
    }
  }

  exportButton.addEventListener("click", async () => {
    const settings = await storage.loadSettings();
    const payload = JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      enabled: settings.enabled,
      gains: settings.gains
    }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `twitch-volume-balance-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showMessage("設定を書き出しました。");
  });

  importButton.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async () => {
    const [file] = importFile.files;
    importFile.value = "";
    if (!file) return;

    try {
      if (file.size > 1024 * 1024) throw new Error("ファイルサイズは1MB以下にしてください。");
      const payload = JSON.parse(await file.text());
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("設定ファイルの形式が正しくありません。");
      }
      if (!payload.gains || typeof payload.gains !== "object" || Array.isArray(payload.gains)) {
        throw new Error("チャンネル設定の形式が正しくありません。");
      }
      if (Object.keys(payload.gains).length > storage.maxChannels) {
        throw new Error(`読み込めるチャンネルは${storage.maxChannels}件までです。`);
      }

      const gains = storage.sanitizeGains(payload.gains);
      await storage.saveSettings({ enabled: payload.enabled !== false, gains });
      showMessage(`${Object.keys(gains).length}件のチャンネル設定を読み込みました。`);
      render();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true);
    }
  });

  clearAll.addEventListener("click", async () => {
    if (!confirm("保存済みのチャンネル設定をすべて削除しますか？")) return;
    await storage.saveSettings({ gains: {} });
    showMessage("すべてのチャンネル設定を削除しました。");
    render();
  });

  chrome.storage.onChanged.addListener((_changes, areaName) => {
    if (areaName === "sync") render();
  });
  render().catch((error) => showMessage(error.message, true));
})();
