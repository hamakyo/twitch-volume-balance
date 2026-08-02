(function initializeAudioEngine() {
  "use strict";

  if (window.__twitchVolumeBalanceEngine) return;
  window.__twitchVolumeBalanceEngine = true;

  const CONFIG_EVENT = "twitch-volume-balance:config";
  const STATUS_EVENT = "twitch-volume-balance:status";
  const READY_EVENT = "twitch-volume-balance:ready";
  const graphs = new Map();
  let audioContext = null;
  let current = { enabled: true, gain: 1, channel: null };
  let lastError = null;

  function safeGain(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(2, Math.max(0, numeric)) : 1;
  }

  function effectiveGain() {
    return current.enabled ? safeGain(current.gain) : 1;
  }

  function reportStatus() {
    window.dispatchEvent(new CustomEvent(STATUS_EVENT, {
      detail: JSON.stringify({
        connected: graphs.size > 0,
        contextState: audioContext?.state || "not-created",
        error: lastError,
        videoCount: graphs.size
      })
    }));
  }

  function setGraphGain(graph, value) {
    const now = audioContext?.currentTime || 0;
    graph.gain.gain.cancelScheduledValues(now);
    graph.gain.gain.setTargetAtTime(value, now, 0.015);
  }

  function applyGain() {
    const value = effectiveGain();
    for (const graph of graphs.values()) setGraphGain(graph, value);
    reportStatus();
  }

  function ensureContext() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("このブラウザは Web Audio API に対応していません。");
      audioContext = new AudioContextClass();
    }
    return audioContext;
  }

  function connectVideo(video) {
    if (!(video instanceof HTMLMediaElement) || graphs.has(video)) return;

    try {
      const context = ensureContext();
      const source = context.createMediaElementSource(video);
      const gain = context.createGain();
      const limiter = context.createDynamicsCompressor();

      limiter.threshold.value = -3;
      limiter.knee.value = 12;
      limiter.ratio.value = 4;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      gain.gain.value = effectiveGain();

      source.connect(gain);
      gain.connect(limiter);
      limiter.connect(context.destination);
      graphs.set(video, { source, gain, limiter });
      lastError = null;

      video.addEventListener("play", resumeContext, { passive: true });
      reportStatus();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      reportStatus();
    }
  }

  function pruneDisconnectedVideos() {
    for (const [video, graph] of graphs) {
      if (video.isConnected) continue;
      graph.source.disconnect();
      graph.gain.disconnect();
      graph.limiter.disconnect();
      graphs.delete(video);
    }
  }

  function scanForVideos(root = document) {
    pruneDisconnectedVideos();
    if (!current.enabled || Math.abs(current.gain - 1) < 0.001) return;
    if (root instanceof HTMLMediaElement) connectVideo(root);
    if (typeof root.querySelectorAll === "function") {
      for (const video of root.querySelectorAll("video")) connectVideo(video);
    }
  }

  function resumeContext() {
    if (audioContext?.state === "suspended") {
      audioContext.resume().then(reportStatus).catch(() => {});
    }
  }

  window.addEventListener(CONFIG_EVENT, (event) => {
    let detail = null;
    try {
      detail = event instanceof CustomEvent && typeof event.detail === "string"
        ? JSON.parse(event.detail)
        : null;
    } catch {}
    if (!detail || typeof detail !== "object") return;

    current = {
      enabled: detail.enabled !== false,
      gain: safeGain(detail.gain),
      channel: typeof detail.channel === "string" ? detail.channel : null
    };
    scanForVideos();
    applyGain();
    resumeContext();
  });

  document.addEventListener("pointerdown", resumeContext, { capture: true, passive: true });
  document.addEventListener("keydown", resumeContext, { capture: true, passive: true });

  const observer = new MutationObserver((mutations) => {
    pruneDisconnectedVideos();
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) scanForVideos(node);
      }
    }
  });

  function startObserving() {
    scanForVideos();
    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    window.dispatchEvent(new Event(READY_EVENT));
    reportStatus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserving, { once: true });
  } else {
    startObserving();
  }
})();
