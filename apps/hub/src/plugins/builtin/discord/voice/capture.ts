import { SpeechDecoder } from './pcm';
import type { VoiceLink } from './link';
import { messageOf } from '@smarteverything/logging';

const SILENCE_MS = 600;

export interface CaptureDeps {
  readonly link: VoiceLink;
  readonly shouldCapture: (userId: string) => boolean;
  readonly heard: (userId: string, pcm: Int16Array) => void;
  readonly ended: (userId: string) => void;
  readonly failed: (cause: unknown) => void;
}

export interface CaptureCounts {
  readonly corruptPackets: number;
  readonly lastCorruption: string | null;
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
    try {
      for await (const packet of this.deps.link.listen(userId, SILENCE_MS)) {
        this.take(userId, decoder.decode.bind(decoder), packet);
      }
    } finally {
      decoder.free();
      this.listening.delete(userId);
    }
    this.deps.ended(userId);
  }

  private take(
    userId: string,
    decode: (packet: Uint8Array) => Int16Array,
    packet: Uint8Array,
  ): void {
    let pcm: Int16Array;
    try {
      pcm = decode(packet);
    } catch (cause) {
      this.badPackets += 1;
      this.lastBad = messageOf(cause);
      return;
    }
    this.deps.heard(userId, pcm);
  }
}
