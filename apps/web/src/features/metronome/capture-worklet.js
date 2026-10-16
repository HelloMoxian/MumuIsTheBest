// Capture only: no microphone samples are routed to speakers. Keep this thread allocation-light.
class HumCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(2048);
    this.position = 0;
    this.samples = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this.ring[this.position] = input[i];
      this.position = (this.position + 1) % this.ring.length;
      this.samples++;
      if (this.samples >= this.ring.length && this.samples % 1024 === 0) {
        const samples = new Float32Array(this.ring.length);
        for (let j = 0; j < samples.length; j++) samples[j] = this.ring[(this.position + j) % this.ring.length];
        this.port.postMessage({ samples, sampleRate, time: (currentFrame + i + 1 - samples.length / 2) / sampleRate }, [samples.buffer]);
      }
    }
    return true;
  }
}
registerProcessor("metronome-hum-capture", HumCapture);
