import type { CallPhase } from '../call-state';

export const WAVE_BARS = 33;

export const HISTORY_STEP_MS = 50;

export type WaveMode = 'speaking' | 'listening' | 'thinking' | 'idle';

export type AuraColour = 'primary' | 'viz-1' | 'on-surface-faint';

const CENTRE = (WAVE_BARS - 1) / 2;
const NEWEST = WAVE_BARS - 1;
const BAR_FLOOR = 0.08;
const MUTED_HEIGHT = 0.06;
const IDLE_HEIGHT = 0.07;
const ATTACK = 0.5;
const RELEASE = 0.16;
const FRAME_MS = 1000 / 60;
const AURA_FLOOR = 0.2;
const AURA_STATIC = 0.55;
const AURA_MUTED = 0.35;

export function waveModeOf(phase: CallPhase): WaveMode {
  switch (phase) {
    case 'speaking':
    case 'listening':
      return phase;
    case 'thinking':
    case 'connecting':
      return 'thinking';
    case 'idle':
    case 'reconnecting':
    case 'ended':
      return 'idle';
  }
}

export function waveMoves(mode: WaveMode, muted: boolean): boolean {
  return mode !== 'idle' && !(mode === 'listening' && muted);
}

export function emptyHistory(): readonly number[] {
  return Array.from({ length: WAVE_BARS }, () => 0);
}

export function pushLevel(history: readonly number[], level: number): readonly number[] {
  'worklet';
  return [...history.slice(1), level];
}

export function smoothLevel(current: number, target: number, elapsedMs: number): number {
  'worklet';
  const base = target > current ? ATTACK : RELEASE;
  const share = 1 - Math.pow(1 - base, elapsedMs / FRAME_MS);
  return current + (target - current) * share;
}

function jitter(index: number): number {
  'worklet';
  return 0.82 + 0.18 * Math.sin(index * 12.9);
}

function bell(index: number): number {
  'worklet';
  return 0.5 + 0.5 * Math.cos((Math.PI * (index - CENTRE)) / WAVE_BARS);
}

function clamped(height: number): number {
  'worklet';
  return Math.max(BAR_FLOOR, Math.min(1, height));
}

function speakingBar(history: readonly number[], index: number): number {
  'worklet';
  const reach = Math.round(Math.abs(index - CENTRE));
  return (history[NEWEST - reach] ?? 0) * jitter(index) * (0.55 + 0.45 * bell(index)) * 1.15;
}

function thinkingBar(seconds: number, index: number): number {
  'worklet';
  return 0.12 + 0.2 * (0.5 + 0.5 * Math.sin(seconds * 3.2 - index * 0.45)) * bell(index);
}

export function liveHeights(
  mode: WaveMode,
  history: readonly number[],
  seconds: number,
): readonly number[] {
  'worklet';
  return Array.from({ length: WAVE_BARS }, (_, index) => {
    switch (mode) {
      case 'speaking':
        return clamped(speakingBar(history, index));
      case 'listening':
        return clamped((history[index] ?? 0) * jitter(index) * 1.1);
      case 'thinking':
        return clamped(thinkingBar(seconds, index));
      case 'idle':
        return clamped(IDLE_HEIGHT);
    }
  });
}

export function stillHeights(mode: WaveMode, muted: boolean): readonly number[] {
  return Array.from({ length: WAVE_BARS }, (_, index) => {
    switch (mode) {
      case 'speaking':
        return clamped(0.14 + 0.62 * bell(index) * jitter(index));
      case 'listening':
        return clamped(muted ? MUTED_HEIGHT : 0.1 + 0.26 * bell(index) * jitter(index));
      case 'thinking':
        return clamped(0.14 + 0.1 * (0.5 + 0.5 * Math.sin(index * 0.5)));
      case 'idle':
        return clamped(IDLE_HEIGHT);
    }
  });
}

export function auraColourOf(mode: WaveMode, muted: boolean): AuraColour | null {
  if (mode === 'speaking') {
    return 'primary';
  }
  if (mode === 'listening') {
    return muted ? 'on-surface-faint' : 'viz-1';
  }
  return null;
}

export function auraOpacity(level: number, muted: boolean, reduced: boolean): number {
  'worklet';
  if (muted) {
    return AURA_MUTED;
  }
  if (reduced) {
    return AURA_STATIC;
  }
  return AURA_FLOOR + (1 - AURA_FLOOR) * Math.max(0, Math.min(1, level));
}
