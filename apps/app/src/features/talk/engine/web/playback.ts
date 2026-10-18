import {
  TALK_END_TONE,
  TALK_FRAME_MS,
  TALK_SAMPLE_RATE,
  TALK_START_TONE,
} from '@smarteverything/domain';

const JITTER_FLOOR_S = 0.12;
const JITTER_CEILING_S = 0.5;
const JITTER_GROWTH = 2;
const JITTER_DECAY = 0.995;
const SAME_UTTERANCE_GAP_S = 0.4;
const VOLUME_RAMP_S = 0.03;
const LEVEL_GAIN = 4;
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
  private jitter = JITTER_FLOOR_S;
  private timestamp = 0;
  private output: GainNode | null = null;
  private volume = 1;
  private sinkId = '';
  private levelListener: ((level: number) => void) | null = null;
  private readonly scheduled = new Map<AudioBufferSourceNode, number>();

  constructor(private readonly onFailure: (error: unknown) => void) {}

  begin(): void {
    const context = this.contextNow();
    this.end();
    this.nextTime = context.currentTime + this.jitter;
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
    this.scheduled.forEach((_level, source) => {
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

  onLevel(listener: ((level: number) => void) | null): void {
    this.levelListener = listener;
  }

  unlock(): void {
    this.contextNow();
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.output !== null && this.context !== null) {
      this.output.gain.setTargetAtTime(volume, this.context.currentTime, VOLUME_RAMP_S);
    }
  }

  async setSink(sinkId: string): Promise<void> {
    if (sinkId === this.sinkId) {
      return;
    }
    this.sinkId = sinkId;
    await this.context?.setSinkId(sinkId);
  }

  probe(samples: Float32Array<ArrayBuffer>, sampleRate: number): Promise<void> {
    const context = this.contextNow();
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputOf(context));
    return new Promise((resolve) => {
      source.addEventListener('ended', () => {
        resolve();
      });
      source.start();
    });
  }

  close(): void {
    this.end();
    this.context?.close().catch(this.onFailure);
    this.context = null;
    this.output = null;
  }

  private contextNow(): AudioContext {
    const context =
      this.context ??
      new AudioContext({
        latencyHint: 'interactive',
        ...(this.sinkId === '' ? {} : { sinkId: this.sinkId }),
      });
    this.context = context;
    if (context.state === 'suspended') {
      context.resume().catch(this.onFailure);
    }
    return context;
  }

  private outputOf(context: AudioContext): GainNode {
    if (this.output !== null) {
      return this.output;
    }
    const gain = context.createGain();
    gain.gain.value = this.volume;
    gain.connect(context.destination);
    this.output = gain;
    return gain;
  }

  private levelOf(samples: Float32Array): number {
    let sum = 0;
    for (const sample of samples) {
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / Math.max(1, samples.length));
    return Math.min(1, rms * this.volume * LEVEL_GAIN);
  }

  private played(source: AudioBufferSourceNode): void {
    this.scheduled.delete(source);
    this.levelListener?.(this.scheduled.values().next().value ?? 0);
  }

  private settle(currentTime: number): number {
    const late = currentTime - this.nextTime;
    this.jitter =
      late > 0 && late < SAME_UTTERANCE_GAP_S
        ? Math.min(JITTER_CEILING_S, this.jitter * JITTER_GROWTH)
        : Math.max(JITTER_FLOOR_S, this.jitter * JITTER_DECAY);
    return this.jitter / 2;
  }

  private schedule(context: AudioContext, data: AudioData): void {
    const samples = new Float32Array(data.numberOfFrames);
    data.copyTo(samples, { planeIndex: 0, format: 'f32-planar' });
    const buffer = context.createBuffer(1, data.numberOfFrames, data.sampleRate);
    buffer.copyToChannel(samples, 0);
    data.close();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputOf(context));
    const first = this.scheduled.size === 0;
    const level = this.levelOf(samples);
    this.scheduled.set(source, level);
    if (first) {
      this.levelListener?.(level);
    }
    source.addEventListener('ended', () => {
      this.played(source);
    });
    const at = Math.max(this.nextTime, context.currentTime + this.settle(context.currentTime));
    source.start(at);
    this.nextTime = at + buffer.duration;
  }
}
