import {
  TALK_END_TONE,
  TALK_FRAME_MS,
  TALK_SAMPLE_RATE,
  TALK_START_TONE,
} from '@smarteverything/domain';

const JITTER_S = 0.06;
const FRAME_US = TALK_FRAME_MS * 1000;

export type Tone = 'permit' | 'busy' | 'roger' | 'end';

const TONES: Readonly<Record<Tone, readonly (readonly [number, number])[]>> = {
  permit: TALK_START_TONE,
  busy: [
    [420, 0.12],
    [0, 0.06],
    [420, 0.12],
  ],
  roger: [[1200, 0.08]],
  end: TALK_END_TONE,
};

export class Playback {
  private context: AudioContext | null = null;
  private decoder: AudioDecoder | null = null;
  private nextTime = 0;
  private timestamp = 0;
  private output: { readonly gain: GainNode; readonly analyser: AnalyserNode } | null = null;
  private readonly scheduled = new Set<AudioBufferSourceNode>();

  constructor(private readonly onFailure: (error: unknown) => void) {}

  begin(): void {
    const context = this.contextNow();
    this.end();
    this.nextTime = context.currentTime + JITTER_S;
    this.timestamp = 0;
    const decoder = new AudioDecoder({
      output: (data): void => {
        this.schedule(context, data);
      },
      error: this.onFailure,
    });
    decoder.configure({ codec: 'opus', sampleRate: TALK_SAMPLE_RATE, numberOfChannels: 1 });
    this.decoder = decoder;
  }

  push(packet: Uint8Array): void {
    if (this.decoder?.state !== 'configured') {
      return;
    }
    this.decoder.decode(
      new EncodedAudioChunk({ type: 'key', timestamp: this.timestamp, data: packet }),
    );
    this.timestamp += FRAME_US;
  }

  end(): void {
    const decoder = this.decoder;
    this.decoder = null;
    if (decoder?.state === 'configured') {
      decoder.flush().then(() => {
        decoder.close();
      }, this.onFailure);
    }
  }

  tone(tone: Tone): void {
    const context = this.contextNow();
    let at = Math.max(context.currentTime, this.nextTime);
    for (const [frequency, seconds] of TONES[tone]) {
      if (frequency > 0) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.12, at);
        gain.gain.exponentialRampToValueAtTime(0.001, at + seconds);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + seconds);
      }
      at += seconds;
    }
  }

  cut(): void {
    this.scheduled.forEach((source) => {
      source.stop();
    });
    this.scheduled.clear();
    this.end();
    if (this.context !== null) {
      this.nextTime = this.context.currentTime;
    }
  }

  playing(): boolean {
    return this.scheduled.size > 0;
  }

  outputLevel(): number {
    const analyser = this.output?.analyser;
    if (analyser === undefined) {
      return 0;
    }
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) {
      sum += sample * sample;
    }
    return Math.min(1, Math.sqrt(sum / samples.length) * 4);
  }

  unlock(): void {
    this.contextNow();
  }

  close(): void {
    this.end();
    this.context?.close().catch(this.onFailure);
    this.context = null;
    this.output = null;
  }

  private contextNow(): AudioContext {
    const context = this.context ?? new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    if (context.state === 'suspended') {
      context.resume().catch(this.onFailure);
    }
    return context;
  }

  private outputOf(context: AudioContext): {
    readonly gain: GainNode;
    readonly analyser: AnalyserNode;
  } {
    if (this.output !== null) {
      return this.output;
    }
    const gain = context.createGain();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    gain.connect(analyser);
    analyser.connect(context.destination);
    this.output = { gain, analyser };
    return this.output;
  }

  private schedule(context: AudioContext, data: AudioData): void {
    const samples = new Float32Array(data.numberOfFrames);
    data.copyTo(samples, { planeIndex: 0, format: 'f32-planar' });
    const buffer = context.createBuffer(1, data.numberOfFrames, data.sampleRate);
    buffer.copyToChannel(samples, 0);
    data.close();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputOf(context).gain);
    this.scheduled.add(source);
    source.addEventListener('ended', () => {
      this.scheduled.delete(source);
    });
    const at = Math.max(this.nextTime, context.currentTime + JITTER_S / 2);
    source.start(at);
    this.nextTime = at + buffer.duration;
  }
}
