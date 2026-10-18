import type { DisplayMode, DisplayOutput } from '@smarteverything/domain';

export type BackendChange =
  | { readonly kind: 'enabled'; readonly output: string; readonly enabled: boolean }
  | { readonly kind: 'mode'; readonly output: string; readonly mode: DisplayMode }
  | { readonly kind: 'scale'; readonly output: string; readonly percent: number }
  | { readonly kind: 'rotation'; readonly output: string; readonly degrees: number }
  | { readonly kind: 'primary'; readonly output: string }
  | { readonly kind: 'position'; readonly output: string; readonly x: number; readonly y: number }
  | { readonly kind: 'hdr'; readonly output: string; readonly enabled: boolean }
  | { readonly kind: 'vrr'; readonly output: string; readonly policy: string }
  | { readonly kind: 'brightness'; readonly output: string; readonly level: number };

export type DisplayRestore = readonly string[];

export interface DisplayBackend {
  readonly name: 'kscreen' | 'wlr-randr' | 'xrandr';
  readonly read: () => Promise<readonly DisplayOutput[]>;
  readonly capture: () => Promise<DisplayRestore>;
  readonly apply: (change: BackendChange) => Promise<void>;
  readonly restore: (restore: DisplayRestore) => Promise<void>;
}

export const REFRESH_TOLERANCE_HZ = 0.01;

export function roundRefresh(hertz: number): number {
  return Math.round(hertz * 100) / 100;
}
