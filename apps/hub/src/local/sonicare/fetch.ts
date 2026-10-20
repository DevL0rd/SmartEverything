import type { BRUSH_FETCH, BRUSH_TRANSFER, SonicareProfile } from '@smarteverything/domain';
import { cancelTransferStep, fullOf, KEY, sessionFetchSteps } from '@smarteverything/ble';
import type { z } from 'zod';
import type { FetchContext, FetchResult } from '../toothbrush/brand';
import type { DeviceState } from '../toothbrush/fleet';

const STORED_WINDOW = 400;

const PER_RESULT = 6;

const DEADLINE_MS = 6000;

const STALE_MS = 30_000;

type Fetch = z.infer<typeof BRUSH_FETCH>;

type Transfer = z.infer<typeof BRUSH_TRANSFER>;

export function missingIds(latest: number, have: ReadonlySet<number>): number[] {
  const wanted: number[] = [];
  for (let id = latest; id > Math.max(0, latest - STORED_WINDOW); id -= 1) {
    if (!have.has(id)) {
      wanted.push(id);
    }
  }
  return wanted;
}

function transferOf(profile: SonicareProfile): Transfer {
  return profile.family === 'kids'
    ? { completeOn: null, cancel: null, deadlineMs: DEADLINE_MS }
    : {
        completeOn: fullOf(KEY.recordControl),
        cancel: cancelTransferStep(profile),
        deadlineMs: DEADLINE_MS,
      };
}

export interface SonicareFetchContext extends FetchContext {
  readonly profile: SonicareProfile;
  readonly latest: number | null;
}

function ready(state: DeviceState, profile: SonicareProfile, nowMs: number): boolean {
  const { runtime } = state;
  if (state.fetching.size > 0 && nowMs - state.fetchStartedAt > STALE_MS) {
    state.fetching.clear();
  }
  const idle = runtime.state.activity !== 'brushing' && runtime.state.activity !== 'paused';
  const open = !runtime.transferring && state.fetching.size === 0;
  return profile.history === 'retained' && state.link.phase === 'linked' && idle && open;
}

export function fetchFor(context: SonicareFetchContext): FetchResult {
  const { state, profile, nowMs, latest } = context;
  if (latest === null || !ready(state, profile, nowMs)) {
    return { fetch: [], transfer: null };
  }
  const have = new Set([...context.stored(), ...state.unavailable]);
  const ids = missingIds(latest, have).slice(0, PER_RESULT);
  const fetch: Fetch[] = ids.map((sessionId) => ({
    sessionId,
    steps: sessionFetchSteps(profile, sessionId),
  }));
  ids.forEach((id) => state.fetching.add(id));
  state.noteFetch(nowMs);
  return { fetch, transfer: fetch.length === 0 ? null : transferOf(profile) };
}
