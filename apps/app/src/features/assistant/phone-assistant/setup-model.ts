import type { IconName } from '../../../components/icon';

const SETUP_STEP_IDS = [
  'assistant',
  'side_key',
  'microphone',
  'overlay',
  'battery',
] as const;

export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

export type SetupActionKind =
  | 'open_assistant_settings'
  | 'open_side_key_settings'
  | 'confirm_side_key'
  | 'undo_side_key'
  | 'allow_microphone'
  | 'open_overlay_settings'
  | 'open_battery_settings';

export interface SetupFacts {
  readonly assistant: boolean | null;
  readonly sideKey: boolean;
  readonly canOpenSideKey: boolean;
  readonly microphone: boolean | null;
  readonly overlay: boolean | null;
  readonly battery: boolean | null;
}

export type SetupState = 'done' | 'todo' | 'unknown';

interface SetupAction {
  readonly kind: SetupActionKind;
  readonly label: string;
}

export interface SetupStep {
  readonly id: SetupStepId;
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
  readonly state: SetupState;
  readonly actions: readonly SetupAction[];
}

export interface SetupProgress {
  readonly done: number;
  readonly total: number;
  readonly ready: boolean;
  readonly next: SetupStep | null;
}

const UPDATE_NEEDED = 'This version of the app cannot check this. Update the app to see it here.';

interface StepText {
  readonly icon: IconName;
  readonly title: string;
  readonly done: string;
  readonly todo: string;
  readonly act: SetupAction;
}

const TEXT: Readonly<Record<SetupStepId, StepText>> = {
  assistant: {
    icon: 'sparkles',
    title: 'Digital assistant app',
    done: 'SmartEverything is your digital assistant. The assist gesture and a long press of the side key open it.',
    todo: 'Choose SmartEverything as the Digital assistant app. Android does not let an app pick this for itself.',
    act: { kind: 'open_assistant_settings', label: 'Choose in settings' },
  },
  side_key: {
    icon: 'power',
    title: 'Side key long press',
    done: 'You set the side key long press to the digital assistant.',
    todo: 'In Settings, Advanced features, Side button, set Press and hold to Digital assistant app. Android does not report this setting, so mark it done yourself.',
    act: { kind: 'open_side_key_settings', label: 'Open side key settings' },
  },
  microphone: {
    icon: 'mic',
    title: 'Microphone',
    done: 'Allowed. Calls and the wake listener can hear you.',
    todo: 'Needed to hear you in a call and for the wake listener.',
    act: { kind: 'allow_microphone', label: 'Allow microphone' },
  },
  overlay: {
    icon: 'audioLines',
    title: 'Voice bar over other apps',
    done: 'The bar with call controls can show over other apps.',
    todo: 'Without it, call controls show as a notification only. Choosing SmartEverything as your assistant usually turns this on too.',
    act: { kind: 'open_overlay_settings', label: 'Allow in settings' },
  },
  battery: {
    icon: 'battery',
    title: 'Keep running in the background',
    done: 'Battery use is Unrestricted, so Android will not cut a call or the listener.',
    todo: 'Android may stop the app while the screen is off. Set its battery use to Unrestricted. On Samsung also remove it from Sleeping apps.',
    act: { kind: 'open_battery_settings', label: 'Open battery settings' },
  },
};

function stateOf(known: boolean | null): SetupState {
  if (known === null) return 'unknown';
  return known ? 'done' : 'todo';
}

function sideKeyActions(facts: SetupFacts): readonly SetupAction[] {
  if (facts.sideKey) return [{ kind: 'undo_side_key', label: 'Not set after all' }];
  const open: readonly SetupAction[] = facts.canOpenSideKey ? [TEXT.side_key.act] : [];
  return [...open, { kind: 'confirm_side_key', label: 'Mark as done' }];
}

function stateFor(id: SetupStepId, facts: SetupFacts): SetupState {
  switch (id) {
    case 'assistant':
      return stateOf(facts.assistant);
    case 'side_key':
      return facts.sideKey ? 'done' : 'todo';
    case 'microphone':
      return stateOf(facts.microphone);
    case 'overlay':
      return stateOf(facts.overlay);
    case 'battery':
      return stateOf(facts.battery);
  }
}

function actionsFor(id: SetupStepId, state: SetupState, facts: SetupFacts): readonly SetupAction[] {
  if (id === 'side_key') return sideKeyActions(facts);
  return state === 'todo' ? [TEXT[id].act] : [];
}

function bodyFor(id: SetupStepId, state: SetupState): string {
  if (state === 'unknown') return UPDATE_NEEDED;
  return state === 'done' ? TEXT[id].done : TEXT[id].todo;
}

export function setupSteps(facts: SetupFacts): readonly SetupStep[] {
  return SETUP_STEP_IDS.map((id) => {
    const state = stateFor(id, facts);
    const { icon, title } = TEXT[id];
    return {
      id,
      icon,
      title,
      state,
      body: bodyFor(id, state),
      actions: actionsFor(id, state, facts),
    };
  });
}

export function setupProgress(steps: readonly SetupStep[]): SetupProgress {
  const done = steps.filter((step) => step.state === 'done').length;
  return {
    done,
    total: steps.length,
    ready: done === steps.length,
    next: steps.find((step) => step.state !== 'done') ?? null,
  };
}

export function readinessLine(progress: SetupProgress): string {
  if (progress.next === null) return 'Press and hold the side key to start a call.';
  if (progress.next.state === 'unknown') return 'Update the app to finish setting up.';
  return `Next: ${progress.next.title}`;
}
