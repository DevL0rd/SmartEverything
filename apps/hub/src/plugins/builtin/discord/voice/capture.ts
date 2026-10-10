import { concat } from '../../../../assistant-voice/audio';
import { SpeechDecoder, SPEECH_RATE } from './pcm';
import type { VoiceLink } from './link';
import type { Utterance, Utterances } from './utterances';

const SILENCE_MS = 600;
const MAX_UTTERANCE_SECONDS = 30;

export interface CaptureDeps {
  readonly link: VoiceLink;
  readonly utterances: Pick<Utterances, 'enqueue'>;
  readonly shouldCapture: (userId: string) => boolean;
  readonly heard: (userId: string, pcm: Int16Array) => void;
  readonly ended: (userId: string) => void;
  readonly failed: (cause: unknown) => void;
  readonly now: () => number;
}

export interface CaptureCounts {
  readonly corruptPackets: number;
  readonly lastCorruption: string | null;
}

class Speech {
  private chunks: Int16Array[] = [];
  private samples = 0;
  private startedAt: number;

  constructor(
    private readonly userId: string,
    private readonly now: () => number,
  ) {
    this.startedAt = now();
  }

  add(pcm: Int16Array): void {
    this.chunks.push(pcm);
    this.samples += pcm.length;
  }

  get long(): boolean {
    return this.samples >= MAX_UTTERANCE_SECONDS * SPEECH_RATE;
  }

  take(): Utterance | null {
    if (this.chunks.length === 0) {
      return null;
    }
    const utterance = {
      userId: this.userId,
      startedAt: this.startedAt,
      pcm: concat(this.chunks),
    };
    this.chunks = [];
    this.samples = 0;
    this.startedAt = this.now();
    return utterance;
  }
}

export class Capture {
  private readonly listening = new Set<string>();
  private closed = false;
  private badPackets = 0;
  private lastBad: string | null = null;

  constructor(private readonly deps: CaptureDeps) {}

  start(): void {
    this.deps.link.onSpeaking((userId) => {
      this.capture(userId).catch(this.deps.failed);
    });
  }

  close(): void {
    this.closed = true;
  }

  counts(): CaptureCounts {
    return { corruptPackets: this.badPackets, lastCorruption: this.lastBad };
  }

  private async capture(userId: string): Promise<void> {
    if (this.closed || this.listening.has(userId) || !this.deps.shouldCapture(userId)) {
      return;
    }
    this.listening.add(userId);
    const decoder = new SpeechDecoder();
    const speech = new Speech(userId, this.deps.now);
    try {
      for await (const packet of this.deps.link.listen(userId, SILENCE_MS)) {
        this.take(userId, decoder.decode.bind(decoder), packet, speech);
      }
    } finally {
      decoder.free();
      this.listening.delete(userId);
    }
    this.flush(speech);
    this.deps.ended(userId);
  }

  private take(
    userId: string,
    decode: (packet: Uint8Array) => Int16Array,
    packet: Uint8Array,
    speech: Speech,
  ): void {
    let pcm: Int16Array;
    try {
      pcm = decode(packet);
    } catch (cause) {
      this.badPackets += 1;
      this.lastBad = cause instanceof Error ? cause.message : 'unreadable audio packet';
      return;
    }
    this.deps.heard(userId, pcm);
    speech.add(pcm);
    if (speech.long) {
      this.flush(speech);
    }
  }

  private flush(speech: Speech): void {
    const utterance = speech.take();
    if (utterance !== null) {
      this.deps.utterances.enqueue(utterance);
    }
  }
}
