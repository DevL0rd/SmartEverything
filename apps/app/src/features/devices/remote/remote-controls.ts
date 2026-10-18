import type { IconName } from '../../../components/icon';
import { buttonLabel, keyFor, modeKeysOf, type RemoteRole } from '@smarteverything/domain';
import { remoteLayout } from '../model/remote-layout';
import type { RemoteCategory } from './remote-category';

type StepId = 'temp' | 'speed' | 'volume';

export interface StepControl {
  readonly id: StepId;
  readonly label: string;
  readonly up: string;
  readonly down: string;
}

export interface KeyControl {
  readonly key: string;
  readonly role: RemoteRole | null;
  readonly label: string;
  readonly icon: IconName | null;
}

export interface RemoteControlSet {
  readonly power: string | null;
  readonly stepper: StepControl | null;
  readonly keys: readonly KeyControl[];
  readonly modes: readonly string[];
  readonly hasPad: boolean;
}

interface StepPlan {
  readonly id: StepId;
  readonly label: string;
  readonly up: RemoteRole;
  readonly down: RemoteRole;
}

const STEPS: Readonly<Partial<Record<RemoteCategory, StepPlan>>> = {
  ac: { id: 'temp', label: 'Temperature', up: 'temp_up', down: 'temp_down' },
  fan: { id: 'speed', label: 'Speed', up: 'speed_up', down: 'speed_down' },
  speaker: { id: 'volume', label: 'Volume', up: 'vol_up', down: 'vol_down' },
  tv: { id: 'volume', label: 'Volume', up: 'vol_up', down: 'vol_down' },
};

const KEY_ORDER: Readonly<Record<RemoteCategory, readonly RemoteRole[]>> = {
  ac: ['mode', 'swing', 'speed_cycle'],
  fan: ['oscillate', 'speed_cycle', 'mode'],
  light: ['bright_up', 'bright_down'],
  speaker: ['mute', 'input'],
  projector: ['input', 'menu'],
  settop: ['play_pause', 'menu'],
  tv: ['mute', 'input'],
  other: [],
};

const ROLE_ICONS: Readonly<Partial<Record<RemoteRole, IconName>>> = {
  mode: 'snowflake',
  swing: 'refresh',
  oscillate: 'refresh',
  speed_cycle: 'fan',
  bright_up: 'plus',
  bright_down: 'minus',
  mute: 'muted',
  input: 'link',
  menu: 'list',
  play_pause: 'play',
};

const OTHER_SHOWN = 3;

function control(key: string, role: RemoteRole | null): KeyControl {
  return {
    key,
    role,
    label: buttonLabel(key),
    icon: role === null ? null : (ROLE_ICONS[role] ?? null),
  };
}

function stepperOf(category: RemoteCategory, options: readonly string[]): StepControl | null {
  const plan = STEPS[category];
  if (plan === undefined) {
    return null;
  }
  const up = keyFor(options, plan.up);
  const down = keyFor(options, plan.down);
  return up === undefined || down === undefined
    ? null
    : { id: plan.id, label: plan.label, up, down };
}

function claimed(power: string | null, stepper: StepControl | null): ReadonlySet<string> {
  const taken = new Set<string>();
  for (const key of [power, stepper?.up, stepper?.down]) {
    if (key !== null && key !== undefined) {
      taken.add(key);
    }
  }
  return taken;
}

function secondary(
  category: RemoteCategory,
  options: readonly string[],
  taken: ReadonlySet<string>,
): readonly KeyControl[] {
  const plan = STEPS[category];
  const lone = plan === undefined ? [] : [plan.up, plan.down];
  const roles = [...lone, ...KEY_ORDER[category]].flatMap((role) => {
    const key = keyFor(options, role);
    return key === undefined || taken.has(key) ? [] : [control(key, role)];
  });
  if (category !== 'other') {
    return roles;
  }
  return options
    .filter((key) => !taken.has(key))
    .slice(0, OTHER_SHOWN)
    .map((key) => control(key, null));
}

export function controlsFor(
  category: RemoteCategory,
  options: readonly string[],
): RemoteControlSet {
  const power = keyFor(options, 'power') ?? null;
  const stepper = stepperOf(category, options);
  const taken = claimed(power, stepper);
  const modes = modeKeysOf(options);
  const keys = secondary(category, options, taken).filter(
    (candidate) => candidate.role !== 'mode' || modes.length === 0,
  );
  return {
    power,
    stepper,
    keys,
    modes,
    hasPad: Object.keys(remoteLayout(options).pad).length > 0,
  };
}
