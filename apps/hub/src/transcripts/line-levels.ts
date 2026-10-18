import { levelOf } from '@smarteverything/domain';

const FULL_SCALE = 32_768;
const FLOOR_DBFS = -120;
const REMEMBER_MS = 3_600_000;

export function dbfsOfPcm(pcm: Int16Array): number {
  return Math.max(FLOOR_DBFS, 20 * Math.log10(levelOf(pcm, FULL_SCALE)));
}

export class LineLevels {
  private readonly heard = new Map<number, { readonly dbfs: number; readonly at: number }>();

  note(lineId: number, dbfs: number, at: number): void {
    this.heard.set(lineId, { dbfs, at });
    for (const [id, one] of this.heard) {
      if (at - one.at <= REMEMBER_MS) {
        return;
      }
      this.heard.delete(id);
    }
  }

  of(lineId: number): number | null {
    return this.heard.get(lineId)?.dbfs ?? null;
  }
}
