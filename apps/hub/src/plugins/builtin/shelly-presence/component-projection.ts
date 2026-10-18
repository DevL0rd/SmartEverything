import {
  JSON_VALUE,
  type AdapterSink,
  type DeviceCapability,
  type JsonValue,
} from '@smarteverything/domain';
import {
  isShellyVirtual,
  shellyComponentCapability,
  type ShellyDevice,
} from '@smarteverything/shelly';
import { z } from 'zod';

type Component = ShellyDevice['components'][number];
type Base = Pick<DeviceCapability, 'key' | 'label'>;

const NAMED = z.looseObject({ name: z.string().nullish() });
const NUMBER = NAMED.extend({
  min: z.number().nullish(),
  max: z.number().nullish(),
  meta: z
    .looseObject({
      ui: z.looseObject({ unit: z.string().optional(), step: z.number().optional() }).nullish(),
    })
    .nullish(),
});
const ENUM = z.looseObject({ options: z.array(z.string()).default([]) });
const TEXT = z.looseObject({ max_len: z.number().optional() });
const DEFAULT_TEXT_LENGTH = 1024;
const SENSOR_TEXT_LENGTH = 300;
const NUMBER_RANGE = {
  min: -Number.MAX_SAFE_INTEGER,
  max: Number.MAX_SAFE_INTEGER,
  step: 0.000001,
};

export function valueComponent(component: Component): boolean {
  return isShellyVirtual(component.component) || component.component === 'bthomesensor';
}

function numberCapability(component: Component, base: Base): DeviceCapability {
  const config = NUMBER.parse(component.config);
  const ui = config.meta?.ui;
  const unit = ui?.unit;
  return {
    ...base,
    access: 'read_write',
    value: {
      kind: 'number',
      min: config.min ?? NUMBER_RANGE.min,
      max: config.max ?? NUMBER_RANGE.max,
      step: ui?.step ?? NUMBER_RANGE.step,
      ...(unit === undefined ? {} : { unit }),
    },
  };
}

function enumCapability(component: Component, base: Base): DeviceCapability | null {
  const { options } = ENUM.parse(component.config);
  return options.length === 0
    ? null
    : { ...base, access: 'read_write', value: { kind: 'enum', options } };
}

function virtualCapability(component: Component, base: Base): DeviceCapability | null {
  switch (component.component) {
    case 'boolean':
      return { ...base, access: 'read_write', value: { kind: 'boolean' } };
    case 'number':
      return numberCapability(component, base);
    case 'enum':
      return enumCapability(component, base);
    case 'text':
      return {
        ...base,
        access: 'read_write',
        value: {
          kind: 'text',
          maxLength: TEXT.parse(component.config).max_len ?? DEFAULT_TEXT_LENGTH,
        },
      };
    case 'button':
      return { ...base, access: 'write', value: { kind: 'action', arguments: ['event'] } };
    case 'group':
      return { ...base, access: 'write', value: { kind: 'action', arguments: ['value'] } };
    default:
      return null;
  }
}

function sensorCapability(base: Base, value: JsonValue | undefined): DeviceCapability | null {
  if (typeof value === 'boolean') return { ...base, access: 'read', value: { kind: 'boolean' } };
  if (typeof value === 'number')
    return { ...base, access: 'read', value: { kind: 'number', ...NUMBER_RANGE } };
  if (typeof value === 'string')
    return { ...base, access: 'read', value: { kind: 'text', maxLength: SENSOR_TEXT_LENGTH } };
  return null;
}

function capabilityOf(component: Component): DeviceCapability | null {
  if (!valueComponent(component)) return null;
  const name = NAMED.parse(component.config).name;
  const base = { key: shellyComponentCapability(component.key), label: name ?? component.key };
  if (component.component === 'bthomesensor')
    return sensorCapability(base, JSON_VALUE.optional().parse(component.status?.['value']));
  return virtualCapability(component, base);
}

export function componentCapabilities(snapshot: ShellyDevice): DeviceCapability[] {
  return snapshot.components.flatMap((component) => {
    const capability = capabilityOf(component);
    return capability === null ? [] : [capability];
  });
}

export function projectComponents(
  sink: AdapterSink,
  snapshot: ShellyDevice,
  observedAt: string,
  previous: ShellyDevice | null,
): void {
  const online = snapshot.connection.state === 'online';
  const before = new Map(previous?.components.map((entry) => [entry.key, entry]));
  for (const component of snapshot.components) {
    if (!valueComponent(component) || before.get(component.key) === component) continue;
    const status = component.status;
    if (status === null || !('value' in status)) continue;
    sink.state({
      externalId: snapshot.externalId,
      capability: shellyComponentCapability(component.key),
      value: online ? JSON_VALUE.parse(status['value']) : null,
      observedAt,
    });
  }
}
