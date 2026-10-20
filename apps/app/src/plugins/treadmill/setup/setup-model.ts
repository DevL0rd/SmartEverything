import type { TreadmillGattDump } from '@smarteverything/domain';
import type { TreadmillCandidate } from '../../../../modules/health-connect';

export const STEP_LABELS = ['Permission', 'Find', 'Check', 'Read', 'Name'] as const;

export const STEPS = ['permission', 'scan', 'check', 'read', 'name'] as const;

export type SetupStep = (typeof STEPS)[number];

export interface SetupState {
  readonly step: SetupStep;
  readonly permission: 'unknown' | 'granted' | 'denied';
  readonly candidates: readonly TreadmillCandidate[];
  readonly picked: string | null;
  readonly closedKsFit: boolean;
  readonly dump: TreadmillGattDump | null;
}

export type SetupEvent =
  | { readonly type: 'permission'; readonly granted: boolean }
  | { readonly type: 'candidate'; readonly candidate: TreadmillCandidate }
  | { readonly type: 'pick'; readonly address: string }
  | { readonly type: 'closed'; readonly value: boolean }
  | { readonly type: 'dumped'; readonly dump: TreadmillGattDump }
  | { readonly type: 'next' }
  | { readonly type: 'back' };

export function initialSetup(permitted: boolean): SetupState {
  return {
    step: permitted ? 'scan' : 'permission',
    permission: permitted ? 'granted' : 'unknown',
    candidates: [],
    picked: null,
    closedKsFit: false,
    dump: null,
  };
}

function stepNumber(step: SetupStep): number {
  return STEPS.indexOf(step) + 1;
}

export function stepAnnouncement(step: SetupStep): string {
  return `Step ${String(stepNumber(step))} of ${String(STEPS.length)}: ${STEP_LABELS[STEPS.indexOf(step)] ?? ''}`;
}

export function sortedCandidates(
  candidates: readonly TreadmillCandidate[],
): readonly TreadmillCandidate[] {
  return [...candidates].sort((left, right) => right.rssi - left.rssi);
}

function withCandidate(
  list: readonly TreadmillCandidate[],
  candidate: TreadmillCandidate,
): readonly TreadmillCandidate[] {
  const others = list.filter((entry) => entry.address !== candidate.address);
  return [...others, candidate];
}

export function canContinue(state: SetupState): boolean {
  switch (state.step) {
    case 'permission':
      return state.permission === 'granted';
    case 'scan':
      return state.picked !== null;
    case 'check':
      return state.closedKsFit;
    case 'read':
      return state.dump !== null;
    case 'name':
      return false;
  }
}

function moved(state: SetupState, by: 1 | -1): SetupState {
  const next = STEPS[STEPS.indexOf(state.step) + by];
  if (next === undefined || (by === 1 && !canContinue(state))) {
    return state;
  }
  return { ...state, step: next };
}

function permissionAnswered(state: SetupState, granted: boolean): SetupState {
  return {
    ...state,
    permission: granted ? 'granted' : 'denied',
    step: granted && state.step === 'permission' ? 'scan' : state.step,
  };
}

export function setupReducer(state: SetupState, event: SetupEvent): SetupState {
  switch (event.type) {
    case 'permission':
      return permissionAnswered(state, event.granted);
    case 'candidate':
      return { ...state, candidates: withCandidate(state.candidates, event.candidate) };
    case 'pick':
      return { ...state, picked: event.address, dump: null };
    case 'closed':
      return { ...state, closedKsFit: event.value };
    case 'dumped':
      return { ...state, dump: event.dump };
    case 'next':
      return moved(state, 1);
    case 'back':
      return moved(state, -1);
  }
}

export function pickedCandidate(state: SetupState): TreadmillCandidate | null {
  return state.candidates.find((candidate) => candidate.address === state.picked) ?? null;
}
