import {
  curatedControls,
  inTier,
  presentValue,
  withRole,
  type CapabilityRole,
  type DeviceFamily,
  type PresentedCapability,
} from '@smarteverything/domain';
import type { DeviceValues } from '../../../store/state';
import { powerStateOf, type DeviceModel } from './device-model';
import { heroReadingOf, readingsOf } from './readings';
import { observedSummary } from './observed-summary';

export const DIAL_ROLES: ReadonlySet<CapabilityRole> = new Set([
  'target_humidity',
  'target_temperature',
]);

const FAN: readonly CapabilityRole[] = ['fan_speed', 'mode', 'oscillation', 'swing_angle'];
const MEDIA: readonly CapabilityRole[] = [
  'volume',
  'input_source',
  'app_launch',
  'mute',
  'channel',
];

const PREFERRED: Partial<Readonly<Record<DeviceFamily, readonly CapabilityRole[]>>> = {
  air_purifier: ['purifier_mode', 'favourite_level', 'fan_mode'],
  humidifier: ['target_humidity', 'mode', 'mist_level'],
  diffuser: ['spray', 'spray_interval', 'spray_duration', 'ambient_light', 'brightness'],
  tower_fan: FAN,
  fan: FAN,
  light: ['brightness', 'color_temperature'],
  television: MEDIA,
  speaker: MEDIA,
};

export const LEVEL_ROLES: ReadonlySet<CapabilityRole> = new Set([
  'fan_speed',
  'favourite_level',
  'brightness',
  'volume',
]);

const CARD_KINDS: ReadonlySet<string> = new Set(['enum', 'number', 'boolean', 'action']);

const FACT_ROLES: readonly CapabilityRole[] = ['filter_life', 'water_level'];

function cardEligible(presented: PresentedCapability): boolean {
  return (
    presented.writable &&
    presented.colorEncoding === undefined &&
    CARD_KINDS.has(presented.capability.value.kind)
  );
}

function rankOf(presented: PresentedCapability, preferred: readonly CapabilityRole[]): number {
  const index = presented.role === null ? -1 : preferred.indexOf(presented.role);
  return index === -1 ? preferred.length : index;
}

export function cardControls(
  family: DeviceFamily,
  controls: readonly PresentedCapability[],
  count: number,
): readonly PresentedCapability[] {
  const preferred = PREFERRED[family] ?? [];
  return controls
    .filter(cardEligible)
    .map((presented, order) => ({ presented, order, rank: rankOf(presented, preferred) }))
    .sort((left, right) => left.rank - right.rank || left.order - right.order)
    .slice(0, count)
    .map((entry) => entry.presented);
}

export interface CardFact {
  readonly key: string;
  readonly role: CapabilityRole | null;
  readonly label: string;
  readonly text: string;
  readonly unit: string | null;
}

function factOf(presented: PresentedCapability | undefined, values: DeviceValues): CardFact | null {
  const value = presented === undefined ? undefined : values[presented.key]?.value;
  if (presented === undefined || value === undefined) {
    return null;
  }
  return {
    key: presented.key,
    role: presented.role,
    label: presented.label,
    text: presentValue(presented, value),
    unit: presented.unit,
  };
}

function secondaryList(
  model: DeviceModel,
  values: DeviceValues,
  hidden: ReadonlySet<CapabilityRole>,
): readonly PresentedCapability[] {
  return readingsOf(model, values, heroReadingOf(model, values)).filter(
    (presented) => presented.role === null || !hidden.has(presented.role),
  );
}

const LEVEL_TEXT_ROLES: readonly CapabilityRole[] = [
  'fan_mode',
  'favourite_level',
  'fan_speed',
  'mist_level',
  'brightness',
  'volume',
];

const LEVEL_TEXT_BY_FAMILY: Readonly<Partial<Record<DeviceFamily, readonly CapabilityRole[]>>> = {
  diffuser: [],
};

export function levelText(model: DeviceModel, values: DeviceValues): string | null {
  const summary = observedSummary(model, values);
  if (summary !== null) {
    return summary;
  }
  for (const role of LEVEL_TEXT_BY_FAMILY[model.family] ?? LEVEL_TEXT_ROLES) {
    const fact = factOf(withRole(model.presentation, role), values);
    if (fact !== null) {
      return `${fact.label} ${fact.text}`;
    }
  }
  return null;
}

export function cardFacts(
  model: DeviceModel,
  values: DeviceValues,
  hidden: ReadonlySet<CapabilityRole>,
  off = false,
): readonly CardFact[] {
  const hero = heroReadingOf(model, values);
  const role = hero?.role ?? null;
  const shownHero = role !== null && hidden.has(role) ? null : hero;
  const candidates = [
    ...(shownHero === null ? [] : [shownHero]),
    ...(off ? [...DIAL_ROLES] : []).map((dial) => withRole(model.presentation, dial)),
    ...FACT_ROLES.map((fact) => withRole(model.presentation, fact)),
  ];
  const seen = new Set<string>();
  return [...candidates, ...secondaryList(model, values, hidden)].flatMap((presented) => {
    const fact = factOf(presented, values);
    if (fact === null || seen.has(fact.key)) {
      return [];
    }
    seen.add(fact.key);
    return [fact];
  });
}

const SETTING_KINDS: ReadonlySet<string> = new Set(['boolean', 'enum']);

export function settingControls(model: DeviceModel): readonly PresentedCapability[] {
  return inTier(model.presentation, 'setting').filter(
    (presented) => presented.writable && SETTING_KINDS.has(presented.capability.value.kind),
  );
}

const NO_HIDDEN: ReadonlySet<CapabilityRole> = new Set();
const REMOTE_FAMILIES: ReadonlySet<DeviceFamily> = new Set(['ir_blaster', 'ir_remote']);

export type CardWeight = 'none' | 'one' | 'many';

function controlCount(model: DeviceModel): number {
  const primary = curatedControls(model.device).filter(cardEligible);
  return primary.length + settingControls(model).length;
}

export function cardWeight(model: DeviceModel, values: DeviceValues): CardWeight {
  if (powerStateOf(model, values) === 'off') {
    return 'one';
  }
  const controls = controlCount(model);
  if (controls >= 2) {
    return 'many';
  }
  const body =
    controls === 1 ||
    REMOTE_FAMILIES.has(model.family) ||
    cardFacts(model, values, NO_HIDDEN).length > 0;
  return body ? 'one' : 'none';
}

const TARGET_ROLES: readonly CapabilityRole[] = ['target_humidity', 'target_temperature'];

export function targetText(model: DeviceModel, values: DeviceValues): string | null {
  for (const role of TARGET_ROLES) {
    const fact = factOf(withRole(model.presentation, role), values);
    if (fact !== null) {
      return `Target ${fact.text}`;
    }
  }
  return null;
}
