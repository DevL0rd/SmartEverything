import { brushFamilyOf, type BrushGattDump } from '@smarteverything/domain';
import type { BrushCandidate } from '../../../../modules/health-connect';

export const STEPS = ['check', 'allow', 'wake', 'choose', 'pair', 'verify', 'details'] as const;

export type SetupStep = (typeof STEPS)[number];

export const STEP_LABEL: Readonly<Record<SetupStep, string>> = {
  check: 'Check',
  allow: 'Allow',
  wake: 'Wake',
  choose: 'Choose',
  pair: 'Pair',
  verify: 'Verify',
  details: 'Details',
};

export function stepLabels(steps: readonly SetupStep[]): readonly string[] {
  return steps.map((step) => STEP_LABEL[step]);
}

export interface SetupState {
  readonly steps: readonly SetupStep[];
  readonly step: SetupStep;
  readonly philipsClosed: boolean;
  readonly permission: 'unknown' | 'granted' | 'denied';
  readonly candidates: readonly BrushCandidate[];
  readonly picked: string | null;
  readonly associated: string | null;
  readonly bonded: boolean;
  readonly dump: BrushGattDump | null;
  readonly modelKey: string | null;
}

export type SetupEvent =
  | { readonly type: 'closed'; readonly value: boolean }
  | { readonly type: 'permission'; readonly granted: boolean }
  | { readonly type: 'candidate'; readonly candidate: BrushCandidate }
  | { readonly type: 'pick'; readonly address: string }
  | { readonly type: 'associated'; readonly address: string }
  | { readonly type: 'bonded' }
  | { readonly type: 'dumped'; readonly dump: BrushGattDump; readonly bonded: boolean }
  | { readonly type: 'model'; readonly key: string | null }
  | { readonly type: 'next' }
  | { readonly type: 'back' };

export function initialSetup(permitted: boolean, steps: readonly SetupStep[] = STEPS): SetupState {
  return {
    steps,
    step: steps[0] ?? 'check',
    philipsClosed: false,
    permission: permitted ? 'granted' : 'unknown',
    candidates: [],
    picked: null,
    associated: null,
    bonded: false,
    dump: null,
    modelKey: null,
  };
}

export function stepAnnouncement(step: SetupStep, steps: readonly SetupStep[] = STEPS): string {
  const index = steps.indexOf(step);
  return `Step ${String(index + 1)} of ${String(steps.length)}: ${STEP_LABEL[step]}`;
}

export function pickedCandidate(state: SetupState): BrushCandidate | null {
  return state.candidates.find((candidate) => candidate.address === state.picked) ?? null;
}

export function needsBond(state: SetupState): boolean {
  return pickedCandidate(state)?.stack === 'condor';
}

export function sortedCandidates(candidates: readonly BrushCandidate[]): readonly BrushCandidate[] {
  return [...candidates].sort((left, right) => right.rssi - left.rssi);
}

export function canContinue(state: SetupState): boolean {
  switch (state.step) {
    case 'check':
      return state.philipsClosed;
    case 'allow':
      return state.permission === 'granted';
    case 'wake':
      return state.picked !== null;
    case 'choose':
      return state.associated !== null;
    case 'pair':
      return !needsBond(state) || state.bonded;
    case 'verify':
      return state.dump !== null;
    case 'details':
      return false;
  }
}

function moved(state: SetupState, by: 1 | -1): SetupState {
  const next = state.steps[state.steps.indexOf(state.step) + by];
  if (next === undefined || (by === 1 && !canContinue(state))) {
    return state;
  }
  return { ...state, step: next };
}

function withCandidate(
  list: readonly BrushCandidate[],
  candidate: BrushCandidate,
): readonly BrushCandidate[] {
  return [...list.filter((entry) => entry.address !== candidate.address), candidate];
}

type LinkEvent = Extract<
  SetupEvent,
  { readonly type: 'candidate' | 'pick' | 'associated' | 'bonded' | 'dumped' }
>;

type FormEvent = Extract<SetupEvent, { readonly type: 'closed' | 'permission' | 'model' }>;

function linked(state: SetupState, event: LinkEvent): SetupState {
  switch (event.type) {
    case 'candidate':
      return { ...state, candidates: withCandidate(state.candidates, event.candidate) };
    case 'pick':
      return { ...state, picked: event.address, associated: null, bonded: false, dump: null };
    case 'associated':
      return { ...state, associated: event.address };
    case 'bonded':
      return { ...state, bonded: true };
    case 'dumped':
      return { ...state, dump: event.dump, bonded: state.bonded || event.bonded };
  }
}

function filled(state: SetupState, event: FormEvent): SetupState {
  switch (event.type) {
    case 'closed':
      return { ...state, philipsClosed: event.value };
    case 'permission':
      return { ...state, permission: event.granted ? 'granted' : 'denied' };
    case 'model':
      return { ...state, modelKey: event.key };
  }
}

type MoveEvent = Extract<SetupEvent, { readonly type: 'next' | 'back' }>;

function isForm(event: FormEvent | LinkEvent): event is FormEvent {
  return event.type === 'closed' || event.type === 'permission' || event.type === 'model';
}

function isMove(event: SetupEvent): event is MoveEvent {
  return event.type === 'next' || event.type === 'back';
}

export function setupReducer(state: SetupState, event: SetupEvent): SetupState {
  if (isMove(event)) {
    return moved(state, event.type === 'next' ? 1 : -1);
  }
  return isForm(event) ? filled(state, event) : linked(state, event);
}

export const WAKE_HELP =
  'Lift the brush off its charger or press its power button. It is only visible for about twenty seconds, so press again if the list stays empty.';

export const PAIR_HELP =
  'This brush must be paired with the phone first. Android asks once; accept the pairing request.';

const MODEL_NUMBER_UUID = '00002a24';

export function dumpModel(dump: BrushGattDump): string | null {
  const hex = dump.services
    .flatMap((service) => service.characteristics)
    .find((characteristic) =>
      characteristic.uuid.toLowerCase().startsWith(MODEL_NUMBER_UUID),
    )?.value;
  if (hex === undefined || hex.length === 0) {
    return null;
  }
  const text = Array.from(hex.matchAll(/../g), (pair) =>
    String.fromCharCode(Number.parseInt(pair[0], 16)),
  )
    .join('')
    .replace(/\0+$/, '')
    .trim();
  return text === '' ? null : text;
}

export function modelUnknown(dump: BrushGattDump | null): boolean {
  return dump !== null && brushFamilyOf(dumpModel(dump)) === 'unknown';
}

export function canAdd(state: SetupState): boolean {
  return state.dump !== null && (!modelUnknown(state.dump) || state.modelKey !== null);
}
