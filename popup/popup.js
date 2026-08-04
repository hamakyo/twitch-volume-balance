(function initializePopup() {
  "use strict";

  const elements = {
    loading: document.querySelector("#loading"),
    unsupported: document.querySelector("#unsupported"),
    unsupportedTitle: document.querySelector("#unsupportedTitle"),
    unsupportedText: document.querySelector("#unsupportedText"),
    controls: document.querySelector("#controls"),
    enabled: document.querySelector("#enabled"),
    channel: document.querySelector("#channelName"),
    connection: document.querySelector("#connection"),
    gain: document.querySelector("#gain"),
    gainValue: document.querySelector("#gainValue"),
    meterFill: document.querySelector("#meterFill"),
    meterValue: document.querySelector("#meterValue"),
    warning: document.querySelector("#warning"),
    saveHint: document.querySelector("#saveHint"),
    reset: document.querySelector("#reset"),
    options: document.querySelector("#openOptions")
  };
  let tabId = null;
  let saveTimer = null;
  let meterTimer = null;
  let lastRenderSignature = null;

  if (navigator.platform.toLowerCase().includes("mac")) {
    for (const key of document.querySelectorAll("kbd[data-mac]")) key.textContent = key.dataset.mac;
  }

  function setSlider(gain) {
    const percentage = Math.round(Number(gain) * 100);
    elements.gain.value = String(percentage);
    elements.gainValue.value = `${percentage}%`;
    elements.gain.style.setProperty("--fill", `${percentage / 2}%`);
    for (const button of document.querySelectorAll("[data-gain]")) {
      button.classList.toggle("active", Number(button.dataset.gain) === Number(gain));
    }
  }

  function showWarning(message) {
    elements.warning.textContent = message || "";
    elements.warning.classList.toggle("hidden", !message);
  }

  function renderEngine(status) {
    const connected = Boolean(status.engine?.connected);
    const neutral = Number(status.gain) === 1;
    elements.connection.textContent = !status.enabled
      ? "無効"
      : neutral
        ? "補正なし"
        : connected
          ? "補正中"
          : "プレイヤー待機中";
    elements.connection.classList.toggle("connected", status.enabled && (connected || neutral));

    const level = connected && status.enabled ? Number(status.engine?.level || 0) : 0;
    const percentage = Math.round(Math.min(1, Math.max(0, level)) * 100);
    elements.meterFill.style.setProperty("--level", `${percentage}%`);
    elements.meterValue.value = connected ? `${percentage}%` : "待機";
    const warnings = [];
    if (status.diagnostics?.resolution === "vod-fallback") {
      warnings.push("配信者を検出できなかったため、このアーカイブ専用の設定として保存します。Twitch側の画面構成が変わった可能性があります。");
    }
    if (status.engine?.error) warnings.push(`音声処理を開始できませんでした: ${status.engine.error}`);
    showWarning(warnings.join("\n"));
  }

  function render(status) {
    lastRenderSignature = JSON.stringify([
      status?.channel || null,
      status?.channelLabel || null,
      status?.diagnostics?.resolution || null,
      status?.enabled ?? null,
      status?.gain ?? null
    ]);
    elements.loading.classList.add("hidden");
    if (!status?.ok || !status.channel) {
      const archivePending = status?.diagnostics?.route === "archive"
        && status.diagnostics.resolution === "pending";
      elements.unsupportedTitle.textContent = archivePending
        ? "アーカイブの配信者情報を読み込んでいます"
        : "Twitch の配信またはアーカイブページを開いてください";
      elements.unsupportedText.textContent = archivePending
        ? "数秒後に自動で再検出します。ポップアップを開いたままお待ちください。"
        : "すでに開いている場合は、拡張機能の追加後にページを再読み込みします。";
      elements.unsupported.classList.remove("hidden");
      elements.controls.classList.add("hidden");
      return;
    }

    elements.unsupported.classList.add("hidden");
    elements.controls.classList.remove("hidden");
    elements.channel.textContent = status.channelLabel || status.channel;
    elements.saveHint.textContent = status.diagnostics?.resolution === "vod-fallback"
      ? "設定はこのアーカイブ専用として保存されます。"
      : "設定はこのチャンネル専用として保存され、次回から自動で適用されます。";
    elements.enabled.checked = status.enabled;
    document.body.classList.toggle("disabled", !status.enabled);
    setSlider(status.gain);

    renderEngine(status);
  }

  async function send(message) {
    if (tabId === null) throw new Error("Twitch タブが見つかりません。");
    const response = await chrome.tabs.sendMessage(tabId, message);
    if (!response?.ok) throw new Error(response?.error || "設定を反映できませんでした。");
    return response;
  }

  async function load() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id ?? null;
    if (tabId === null) return render(null);
    try {
      render(await send({ type: "GET_STATUS" }));
      render(await send({ type: "START_METERING" }));
      meterTimer = setInterval(async () => {
        try {
          const status = await send({ type: "GET_STATUS" });
          const signature = JSON.stringify([
            status?.channel || null,
            status?.channelLabel || null,
            status?.diagnostics?.resolution || null,
            status?.enabled ?? null,
            status?.gain ?? null
          ]);
          if (signature === lastRenderSignature) renderEngine(status);
          else render(status);
        } catch {}
      }, 150);
    } catch {
      render(null);
    }
  }

  elements.gain.addEventListener("input", () => {
    const gain = Number(elements.gain.value) / 100;
    setSlider(gain);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { render(await send({ type: "SET_GAIN", gain })); }
      catch (error) { showWarning(error.message); }
    }, 80);
  });

  elements.enabled.addEventListener("change", async () => {
    try { render(await send({ type: "SET_ENABLED", enabled: elements.enabled.checked })); }
    catch (error) { showWarning(error.message); }
  });

  elements.reset.addEventListener("click", async () => {
    try { render(await send({ type: "RESET_CHANNEL" })); }
    catch (error) { showWarning(error.message); }
  });

  for (const button of document.querySelectorAll("[data-gain]")) {
    button.addEventListener("click", async () => {
      try { render(await send({ type: "SET_GAIN", gain: Number(button.dataset.gain) })); }
      catch (error) { showWarning(error.message); }
    });
  }

  elements.options.addEventListener("click", () => chrome.runtime.openOptionsPage());
  window.addEventListener("pagehide", () => {
    clearInterval(meterTimer);
    send({ type: "STOP_METERING" }).catch(() => {});
  }, { once: true });
  load();
})();
