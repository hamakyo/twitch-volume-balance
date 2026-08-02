async (page) => {
  await page.evaluate(() => {
    class Param {
      constructor(value = 0) { this.value = value; }
      cancelScheduledValues() {}
      setTargetAtTime(value) { this.value = value; }
    }
    class AudioNodeMock {
      connect() { return this; }
      disconnect() {}
    }
    class AnalyserMock extends AudioNodeMock {
      constructor() {
        super();
        this.fftSize = 256;
        this.smoothingTimeConstant = 0;
      }
      getByteTimeDomainData(samples) {
        for (let index = 0; index < samples.length; index += 1) {
          samples[index] = index % 2 ? 160 : 96;
        }
      }
    }
    class FakeAudioContext {
      constructor() {
        this.state = "running";
        this.currentTime = 0;
        this.destination = new AudioNodeMock();
      }
      createMediaElementSource() { return new AudioNodeMock(); }
      createGain() {
        const node = new AudioNodeMock();
        node.gain = new Param(1);
        return node;
      }
      createDynamicsCompressor() {
        const node = new AudioNodeMock();
        for (const key of ["threshold", "knee", "ratio", "attack", "release"]) node[key] = new Param();
        return node;
      }
      createAnalyser() { return new AnalyserMock(); }
      resume() { return Promise.resolve(); }
    }
    window.AudioContext = FakeAudioContext;
    window.__engineStatuses = [];
    window.addEventListener("twitch-volume-balance:status", (event) => {
      window.__engineStatuses.push(JSON.parse(event.detail));
    });
  });

  await page.addScriptTag({ url: "http://127.0.0.1:8765/content/audio-engine.js" });
  await page.evaluate(() => {
    document.body.append(document.createElement("video"));
    window.dispatchEvent(new CustomEvent("twitch-volume-balance:config", {
      detail: JSON.stringify({ enabled: true, gain: 1, channel: "sample", metering: true })
    }));
  });
  await page.waitForTimeout(300);
  const result = await page.evaluate(() => window.__engineStatuses.at(-1));
  if (!result || !result.connected || result.level <= 0.5) {
    throw new Error(`Unexpected engine result: ${JSON.stringify(result)}`);
  }
}
