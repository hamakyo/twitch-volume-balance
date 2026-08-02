(function initializePopup() {
  "use strict";

  const elements = {
    loading: document.querySelector("#loading"),
    unsupported: document.querySelector("#unsupported"),
    controls: document.querySelector("#controls"),
    enabled: document.querySelector("#enabled"),
    channel: document.querySelector("#channelName"),
    connection: document.querySelector("#connection"),
    gain: document.querySelector("#gain"),
    gainValue: document.querySelector("#gainValue"),
    warning: document.querySelector("#warning"),
    reset: document.querySelector("#reset"),
    options: document.querySelector("#openOptions")
  };
  let tabId = null;
  let saveTimer = null;

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

  function render(status) {
    elements.loading.classList.add("hidden");
    if (!status?.ok || !status.channel) {
      elements.unsupported.classList.remove("hidden");
      elements.controls.classList.add("hidden");
      return;
    }

    elements.unsupported.classList.add("hidden");
    elements.controls.classList.remove("hidden");
    elements.channel.textContent = status.channel;
    elements.enabled.checked = status.enabled;
    document.body.classList.toggle("disabled", !status.enabled);
    setSlider(status.gain);

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
    showWarning(status.engine?.error ? `音声処理を開始できませんでした: ${status.engine.error}` : "");
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
  load();
})();
