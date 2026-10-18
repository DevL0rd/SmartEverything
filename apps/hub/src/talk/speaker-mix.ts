import { OPUS_SILENCE } from '../reach/voice-pacing';

export const SPEAKER_PRIORITY = { talk: 3, assistant: 2, speech: 1 } as const;

export type SpeakerOwner = keyof typeof SPEAKER_PRIORITY;

const LEAD_HOLD_MS = 300;

export function isSilence(packet: Uint8Array): boolean {
  return (
    packet.length === OPUS_SILENCE.length &&
    packet.every((byte, index) => byte === OPUS_SILENCE[index])
  );
}

export class MixSource {
  private lastAt: number;
  private voiceAt = Number.NEGATIVE_INFINITY;
  private playedCount = 0;
  private heldCount = 0;

  constructor(
    readonly sessionId: string,
    readonly owner: SpeakerOwner,
    readonly order: number,
    readonly attachedAt: number,
  ) {
    this.lastAt = attachedAt;
  }

  get played(): number {
    return this.playedCount;
  }

  get held(): number {
    return this.heldCount;
  }

  heard(packet: Uint8Array, now: number): void {
    this.lastAt = now;
    this.voiceAt = isSilence(packet) ? Number.NEGATIVE_INFINITY : now;
  }

  counted(played: boolean): void {
    if (played) {
      this.playedCount += 1;
    } else {
      this.heldCount += 1;
    }
  }

  voiced(now: number): boolean {
    return now - this.voiceAt <= LEAD_HOLD_MS;
  }

  flowing(now: number): boolean {
    return now - this.lastAt <= LEAD_HOLD_MS;
  }

  quietFor(now: number): number {
    return now - this.lastAt;
  }

  ahead(other: MixSource): boolean {
    const byPriority = SPEAKER_PRIORITY[this.owner] - SPEAKER_PRIORITY[other.owner];
    return byPriority === 0 ? this.order < other.order : byPriority > 0;
  }
}

export class SpeakerMix {
  private readonly sources = new Set<MixSource>();
  private order = 0;

  get size(): number {
    return this.sources.size;
  }

  attach(sessionId: string, owner: SpeakerOwner, now: number): MixSource {
    this.order += 1;
    const source = new MixSource(sessionId, owner, this.order, now);
    this.sources.add(source);
    return source;
  }

  detach(source: MixSource): boolean {
    return this.sources.delete(source);
  }

  admit(source: MixSource, packet: Uint8Array, now: number): boolean {
    source.heard(packet, now);
    const played = this.leader(now) === source;
    source.counted(played);
    return played;
  }

  all(): MixSource[] {
    return [...this.sources];
  }

  stale(now: number, quietMs: number): MixSource[] {
    return this.all().filter((source) => source.quietFor(now) > quietMs);
  }

  private leader(now: number): MixSource | null {
    let voiced: MixSource | null = null;
    let flowing: MixSource | null = null;
    for (const source of this.sources) {
      if (source.voiced(now) && (voiced === null || source.ahead(voiced))) {
        voiced = source;
      }
      if (source.flowing(now) && (flowing === null || source.ahead(flowing))) {
        flowing = source;
      }
    }
    return voiced ?? flowing;
  }
}
