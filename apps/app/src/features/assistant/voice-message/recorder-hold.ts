export type HoldZone = 'hold' | 'cancel' | 'lock';

export type HoldRelease = 'send' | 'cancel' | 'keep';

export const PLATFORM_LONG_PRESS_MS = 500;
export const MIC_FRAME = 44;
export const MIC_SWELL = 56;
export const STRIP_HEIGHT = 52;
export const STRIP_INSET = (STRIP_HEIGHT - MIC_FRAME) / 2;
export const LOCK_WIDTH = 40;
export const LOCK_HEIGHT = 96;
export const LOCK_GAP = 16;
export const LOCK_BOTTOM = MIC_FRAME + STRIP_INSET + LOCK_GAP;
export const LOCK_REACH = LOCK_BOTTOM + LOCK_HEIGHT / 2 - MIC_FRAME / 2;

export interface HoldGeometry {
  readonly cancelAt: number;
  readonly lockAt: number;
}

export function holdGeometry(micOffset: number): HoldGeometry {
  return { cancelAt: Math.max(MIC_FRAME, micOffset + MIC_FRAME) / 2, lockAt: LOCK_REACH };
}

export function holdZoneOf(dx: number, dy: number, geometry: HoldGeometry): HoldZone {
  if (-dy >= geometry.lockAt && -dy >= -dx) return 'lock';
  return -dx >= geometry.cancelAt ? 'cancel' : 'hold';
}

export function holdReleaseOf(zone: HoldZone, recording: boolean): HoldRelease {
  if (zone === 'cancel') return 'cancel';
  return zone === 'hold' && recording ? 'send' : 'keep';
}

export interface HoldHandle {
  readonly move: (zone: HoldZone) => void;
  readonly release: (zone: HoldZone) => void;
  readonly interrupt: () => void;
}

export class HoldChannel {
  private handle: HoldHandle | null = null;
  private zone: HoldZone = 'hold';

  attach(handle: HoldHandle): () => void {
    this.handle = handle;
    return () => {
      if (this.handle === handle) this.handle = null;
    };
  }

  begin(): void {
    this.zone = 'hold';
  }

  track(zone: HoldZone): void {
    if (zone === this.zone) return;
    this.zone = zone;
    this.handle?.move(zone);
  }

  end(success: boolean): boolean {
    if (this.handle === null) return false;
    if (success) this.handle.release(this.zone);
    else this.handle.interrupt();
    return true;
  }
}
