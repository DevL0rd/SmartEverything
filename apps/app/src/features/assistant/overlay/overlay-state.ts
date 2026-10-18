import { ValueStore } from '../../../design/external-store';

interface OverlayWake {
  readonly at: number;
  readonly words: string | null;
  readonly muted: boolean;
}

interface OverlaySuperseded {
  readonly by: string;
  readonly at: number;
}

interface OverlayHold {
  readonly active: boolean;
  readonly endedAt: number | null;
}

export interface OverlayExtras {
  readonly wake: OverlayWake | null;
  readonly superseded: OverlaySuperseded | null;
  readonly hold: OverlayHold;
  readonly dismissed: string | null;
}

const NO_EXTRAS: OverlayExtras = {
  wake: null,
  superseded: null,
  hold: { active: false, endedAt: null },
  dismissed: null,
};

export const overlayExtras = new ValueStore<OverlayExtras>(NO_EXTRAS);

function change(part: Partial<OverlayExtras>): void {
  overlayExtras.update((extras) => ({ ...extras, ...part }));
}

export function startWake(words: string | null = null): void {
  change({ wake: { at: Date.now(), words, muted: false }, dismissed: null });
}

export function clearWake(): void {
  if (overlayExtras.get().wake !== null) {
    change({ wake: null });
  }
}

export function setSuperseded(by: string | null): void {
  change({ superseded: by === null ? null : { by, at: Date.now() } });
}

export function setOverlayHold(active: boolean): void {
  change({ hold: { active, endedAt: active ? null : Date.now() } });
}

export function dismissOverlay(key: string): void {
  change({ dismissed: key });
}
