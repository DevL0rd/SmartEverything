import type { AutomationV3, JsonValue } from '@smarteverything/domain';
import type { Device } from '../../../../store/state';
import { maker, type Maker } from './build';

export type TemplateDevice = Pick<Device, 'id' | 'label' | 'kind' | 'model' | 'capabilities'> & {
  readonly room_id?: string | null | undefined;
};

export interface TemplateRoom {
  readonly id: string;
  readonly name: string;
}

export const CATEGORIES = [
  'lights',
  'comfort',
  'safety',
  'appliances',
  'presence',
  'computers',
  'notifications',
  'learn',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  lights: 'Lights',
  comfort: 'Comfort',
  safety: 'Safety',
  appliances: 'Appliances',
  presence: 'Presence',
  computers: 'Computers',
  notifications: 'Notifications',
  learn: 'Learn',
};

export type SlotKind = 'device' | 'devices' | 'room' | 'people' | 'time' | 'number' | 'text';

export interface SlotChoice {
  readonly value: string;
  readonly label: string;
}

export interface Slot {
  readonly name: string;
  readonly label: string;
  readonly kind: SlotKind;
  readonly value: JsonValue;
  readonly choices?: readonly SlotChoice[];
  readonly min?: number;
  readonly max?: number;
  readonly unit?: string;
}

export type SlotValues = Readonly<Record<string, JsonValue>>;

export class SlotError extends Error {
  override readonly name = 'SlotError';
}

export interface Use {
  readonly text: (name: string) => string;
  readonly texts: (name: string) => readonly string[];
  readonly number: (name: string) => number;
}

export interface TemplateSpec {
  readonly id: string;
  readonly deviceId: string | null;
  readonly title: string;
  readonly why: string;
  readonly short?: string;
  readonly name: string;
  readonly category: Category;
  readonly devices: readonly string[];
  readonly slots: readonly Slot[];
  readonly make: (use: Use, m: Maker) => AutomationV3;
}

export interface Template extends Omit<TemplateSpec, 'make'> {
  readonly build: (values?: SlotValues) => AutomationV3;
}

export function readerOf(owner: string, slots: readonly Slot[], given: SlotValues): Use {
  const known = new Map(slots.map((slot) => [slot.name, slot.value] as const));
  const read = (name: string): JsonValue => {
    const value = name in given ? given[name] : known.get(name);
    if (value === undefined) {
      throw new SlotError(`${owner} has no value for ${name}`);
    }
    return value;
  };
  return {
    text: (name): string => {
      const value = read(name);
      if (typeof value !== 'string') throw new SlotError(`${owner}: ${name} is not text`);
      return value;
    },
    texts: (name): readonly string[] => {
      const value = read(name);
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        throw new SlotError(`${owner}: ${name} is not a list of text`);
      }
      return value.map(String);
    },
    number: (name): number => {
      const value = read(name);
      if (typeof value !== 'number') throw new SlotError(`${owner}: ${name} is not a number`);
      return value;
    },
  };
}

export function template(spec: TemplateSpec): Template {
  const { make, ...rest } = spec;
  return {
    ...rest,
    build: (values = {}) => make(readerOf(spec.id, spec.slots, values), maker(spec.id)),
  };
}

export function choicesOf(devices: readonly TemplateDevice[]): readonly SlotChoice[] {
  return devices.map((device) => ({ value: device.id, label: device.label }));
}

export function deviceSlot(
  name: string,
  label: string,
  value: string,
  choices: readonly SlotChoice[],
): Slot {
  return { name, label, kind: 'device', value, choices };
}

export function devicesSlot(
  name: string,
  label: string,
  value: readonly string[],
  choices: readonly SlotChoice[],
): Slot {
  return { name, label, kind: 'devices', value: [...value], choices };
}

export function peopleSlot(
  name: string,
  label: string,
  value: readonly string[],
  choices: readonly SlotChoice[],
): Slot {
  return { name, label, kind: 'people', value: [...value], choices };
}

export function roomSlot(
  name: string,
  label: string,
  value: string,
  choices: readonly SlotChoice[],
): Slot {
  return { name, label, kind: 'room', value, choices };
}

export function timeSlot(name: string, label: string, value: string): Slot {
  return { name, label, kind: 'time', value };
}

export function numberSlot(
  name: string,
  label: string,
  value: number,
  range: { readonly min: number; readonly max: number; readonly unit?: string },
): Slot {
  return { name, label, kind: 'number', value, ...range };
}

export function textSlot(name: string, label: string, value: string): Slot {
  return { name, label, kind: 'text', value };
}

export function messageSlot(value: string): Slot {
  return textSlot('message', 'Message', value);
}
