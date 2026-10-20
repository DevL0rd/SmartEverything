import { SILENCE_DBFS, levelOf, type ListeningSegment } from '@smarteverything/domain';
import type { SpeechSegment } from '../../listening/speech-segment';
import type { WakeClaim, WakeGrant } from '../../wake-name/wake-claims';

const FULL_SCALE = 32_768;
const METER_SAMPLES = 1600;

export function encodePcm(pcm: Int16Array): string {
  return Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64');
}

export function pcmOf(base64: string): Int16Array {
  const bytes = Buffer.from(base64, 'base64');
  const even = bytes.length - (bytes.length % 2);
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + even));
}

function dbfsOf(pcm: Int16Array): number {
  return Math.min(0, Math.max(SILENCE_DBFS, 20 * Math.log10(levelOf(pcm, FULL_SCALE))));
}

export function listeningSegmentOf(segment: SpeechSegment): ListeningSegment {
  return {
    at: new Date(segment.startedAt).toISOString(),
    endedAt: new Date(segment.endedAt).toISOString(),
    levelDbfs: dbfsOf(segment.pcm),
    pcm: encodePcm(segment.pcm),
  };
}

const GRANTED: WakeGrant = { granted: true, onSuperseded: (): void => undefined };

export class GrantedClaims {
  level = 0;
  readonly claims = {
    request: (claim: WakeClaim): WakeGrant => {
      this.level = claim.snippetDbfs;
      return GRANTED;
    },
  };
}

export class LevelMeter {
  private squares = 0;
  private samples = 0;

  feed(pcm: Int16Array): number | null {
    for (const sample of pcm) {
      this.squares += (sample / FULL_SCALE) ** 2;
    }
    this.samples += pcm.length;
    if (this.samples < METER_SAMPLES) {
      return null;
    }
    const level = Math.max(SILENCE_DBFS, 10 * Math.log10(this.squares / this.samples));
    this.squares = 0;
    this.samples = 0;
    return Math.min(0, level);
  }
}
