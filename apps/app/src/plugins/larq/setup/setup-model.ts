import type { BottleBody, BottleDeviceInformation } from '@smarteverything/domain';
import type { BottleCandidate, BottleReadout } from '../../../../modules/health-connect';

export const STEPS = ['permission', 'find', 'read', 'choose'] as const;

export const STEP_LABELS = ['Permission', 'Find', 'Read', 'Choose'] as const;

export type SetupStep = (typeof STEPS)[number];

export interface SetupState {
  readonly step: SetupStep;
  readonly permission: 'unknown' | 'granted' | 'denied';
  readonly candidates: readonly BottleCandidate[];
  readonly picked: string | null;
  readonly readout: BottleReadout | null;
  readonly body: BottleBody;
  readonly filter: boolean;
  readonly personId: string | null;
}

export type SetupEvent =
  | { readonly type: 'permission'; readonly granted: boolean }
  | { readonly type: 'candidate'; readonly candidate: BottleCandidate }
  | { readonly type: 'pick'; readonly address: string }
  | { readonly type: 'read'; readonly readout: BottleReadout }
  | { readonly type: 'body'; readonly body: BottleBody }
  | { readonly type: 'filter'; readonly filter: boolean }
  | { readonly type: 'person'; readonly personId: string | null }
  | { readonly type: 'next' }
  | { readonly type: 'back' };

export function initialSetup(permitted: boolean, personId: string | null): SetupState {
  return {
    step: permitted ? 'find' : 'permission',
    permission: permitted ? 'granted' : 'unknown',
    candidates: [],
    picked: null,
    readout: null,
    body: 680,
    filter: false,
    personId,
  };
}

export function stepAnnouncement(step: SetupStep): string {
  return `Step ${String(STEPS.indexOf(step) + 1)} of ${String(STEPS.length)}: ${STEP_LABELS[STEPS.indexOf(step)] ?? ''}`;
}

export function sortedCandidates(
  candidates: readonly BottleCandidate[],
): readonly BottleCandidate[] {
  return [...candidates].sort((left, right) => right.rssi - left.rssi);
}

export function canContinue(state: SetupState): boolean {
  switch (state.step) {
    case 'permission':
      return state.permission === 'granted';
    case 'find':
      return state.picked !== null;
    case 'read':
      return state.readout !== null;
    case 'choose':
      return false;
  }
}

function moved(state: SetupState, by: 1 | -1): SetupState {
  const next = STEPS[STEPS.indexOf(state.step) + by];
  return next === undefined || (by === 1 && !canContinue(state)) ? state : { ...state, step: next };
}

function withCandidate(
  list: readonly BottleCandidate[],
  candidate: BottleCandidate,
): readonly BottleCandidate[] {
  return [...list.filter((entry) => entry.address !== candidate.address), candidate];
}

type ChoiceEvent = Extract<
  SetupEvent,
  { readonly type: 'pick' | 'read' | 'body' | 'filter' | 'person' }
>;

const CHOICES: ReadonlySet<SetupEvent['type']> = new Set([
  'pick',
  'read',
  'body',
  'filter',
  'person',
]);

function isChoice(event: SetupEvent): event is ChoiceEvent {
  return CHOICES.has(event.type);
}

function choiceApplied(state: SetupState, event: ChoiceEvent): SetupState {
  switch (event.type) {
    case 'pick':
      return { ...state, picked: event.address, readout: null };
    case 'read':
      return { ...state, readout: event.readout };
    case 'body':
      return { ...state, body: event.body };
    case 'filter':
      return { ...state, filter: event.filter };
    case 'person':
      return { ...state, personId: event.personId };
  }
}

export function setupReducer(state: SetupState, event: SetupEvent): SetupState {
  if (isChoice(event)) {
    return choiceApplied(state, event);
  }
  switch (event.type) {
    case 'permission':
      return {
        ...state,
        permission: event.granted ? 'granted' : 'denied',
        step: event.granted && state.step === 'permission' ? 'find' : state.step,
      };
    case 'candidate':
      return { ...state, candidates: withCandidate(state.candidates, event.candidate) };
    case 'next':
      return moved(state, 1);
    case 'back':
      return moved(state, -1);
  }
}

export function pickedCandidate(state: SetupState): BottleCandidate | null {
  return state.candidates.find((candidate) => candidate.address === state.picked) ?? null;
}

export function informationOf(state: SetupState): BottleDeviceInformation | null {
  return state.readout?.dis ?? null;
}

export function signalWord(rssi: number): string {
  if (rssi >= -60) {
    return 'strong';
  }
  return rssi >= -75 ? 'good' : 'weak';
}

export const PICKER_LINE = "Drinks go into this person's water log and Health Connect.";

export const READ_LINE = 'Read once. Nothing changed on the bottle except its clock.';
