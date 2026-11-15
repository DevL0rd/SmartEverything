import type { MediaTile } from '../../../../components/media-grid/tiles';

export const PIN_DIGITS_MIN = 4;

export function pinOf(text: string): string {
  return text.replaceAll(/\D/gu, '');
}

export function pinReady(pin: string): boolean {
  return pin.length >= PIN_DIGITS_MIN;
}

export type SetupStep =
  | { readonly kind: 'choose'; readonly pin: string }
  | { readonly kind: 'repeat'; readonly pin: string; readonly again: string }
  | { readonly kind: 'fingerprint'; readonly pin: string };

export const SETUP_START: SetupStep = { kind: 'choose', pin: '' };

export interface SetupAdvance {
  readonly step: SetupStep;
  readonly error: string | null;
  readonly save: string | null;
}

export function advanceSetup(step: SetupStep, fingerprint: boolean): SetupAdvance {
  if (step.kind === 'choose') {
    if (!pinReady(step.pin)) {
      return { step, error: 'Use at least four digits.', save: null };
    }
    return { step: { kind: 'repeat', pin: step.pin, again: '' }, error: null, save: null };
  }
  if (step.kind === 'repeat') {
    if (step.again !== step.pin) {
      return {
        step: { kind: 'choose', pin: '' },
        error: 'The PINs did not match. Choose it again.',
        save: null,
      };
    }
    if (fingerprint)
      return { step: { kind: 'fingerprint', pin: step.pin }, error: null, save: null };
    return { step, error: null, save: step.pin };
  }
  return { step, error: null, save: step.pin };
}

export function setupStepNumber(step: SetupStep): number {
  if (step.kind === 'choose') return 1;
  return step.kind === 'repeat' ? 2 : 3;
}

export function msUntil(expiresAt: string, now: number): number {
  return Math.max(0, Date.parse(expiresAt) - now);
}

export type ChangeStep =
  | { readonly kind: 'current'; readonly current: string }
  | { readonly kind: 'choose'; readonly current: string; readonly pin: string }
  | {
      readonly kind: 'repeat';
      readonly current: string;
      readonly pin: string;
      readonly again: string;
    };

export const CHANGE_START: ChangeStep = { kind: 'current', current: '' };

export interface ChangeAdvance {
  readonly step: ChangeStep;
  readonly error: string | null;
  readonly save: { readonly currentPin: string; readonly pin: string } | null;
}

export function advanceChange(step: ChangeStep): ChangeAdvance {
  if (step.kind === 'current') {
    if (!pinReady(step.current)) return { step, error: 'Use at least four digits.', save: null };
    return { step: { kind: 'choose', current: step.current, pin: '' }, error: null, save: null };
  }
  if (step.kind === 'choose') {
    if (!pinReady(step.pin)) return { step, error: 'Use at least four digits.', save: null };
    if (step.pin === step.current) {
      return { step, error: 'Choose a PIN that differs from the current one.', save: null };
    }
    return { step: { ...step, kind: 'repeat', again: '' }, error: null, save: null };
  }
  if (step.again !== step.pin) {
    return {
      step: { kind: 'choose', current: step.current, pin: '' },
      error: 'The PINs did not match. Choose the new PIN again.',
      save: null,
    };
  }
  return { step, error: null, save: { currentPin: step.current, pin: step.pin } };
}

export function changeStepNumber(step: ChangeStep): number {
  if (step.kind === 'current') return 1;
  return step.kind === 'choose' ? 2 : 3;
}

export function changeValue(step: ChangeStep): string {
  if (step.kind === 'current') return step.current;
  return step.kind === 'choose' ? step.pin : step.again;
}

export function withChangeValue(step: ChangeStep, value: string): ChangeStep {
  if (step.kind === 'current') return { ...step, current: value };
  return step.kind === 'choose' ? { ...step, pin: value } : { ...step, again: value };
}

export interface LockedNeighbours {
  readonly current: MediaTile;
  readonly previous: MediaTile | null;
  readonly next: MediaTile | null;
  readonly position: number;
  readonly total: number;
}

export function lockedNeighbours(
  tiles: readonly MediaTile[],
  itemId: string,
): LockedNeighbours | null {
  const index = tiles.findIndex((tile) => tile.id === itemId);
  const current = tiles[index];
  if (current === undefined) return null;
  return {
    current,
    previous: tiles[index - 1] ?? null,
    next: tiles[index + 1] ?? null,
    position: index + 1,
    total: tiles.length,
  };
}

export function landingAfter(tiles: readonly MediaTile[], gone: string): string | null {
  const place = lockedNeighbours(tiles, gone);
  return place?.next?.id ?? place?.previous?.id ?? null;
}
