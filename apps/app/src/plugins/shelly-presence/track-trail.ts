import type { ShellyTrack } from '@smarteverything/shelly';

export const TRAIL_FRAMES = 3;

export type Trail = readonly (readonly ShellyTrack[])[];

export interface TrailState {
  readonly at: string | null;
  readonly shown: readonly ShellyTrack[];
  readonly trail: Trail;
}

export const NO_TRAIL: Trail = [];

export function advanceTrail(
  state: TrailState,
  frame: { readonly at: string | null; readonly tracks: readonly ShellyTrack[] },
  keep: boolean,
): TrailState {
  if (state.at === frame.at && (keep || state.trail.length === 0)) return state;
  return {
    at: frame.at,
    shown: frame.tracks,
    trail:
      keep && state.at !== frame.at
        ? [state.shown, ...state.trail].slice(0, TRAIL_FRAMES)
        : NO_TRAIL,
  };
}
