import {
  SHELLY_VIRTUAL_COMPONENT,
  type ShellyVirtualComponent,
  type AdapterSink,
  type DeviceCapability,
  type JsonValue,
  type ShellyComponent,
  type ShellyPresenceDevice,
} from '@smarteverything/domain';
const VIRTUAL: ReadonlySet<string> = new Set([
  'boolean',
  'number',
  'enum',
  'text',
  'button',
  'group',
]);
export function shellyComponentKey(key: string): `raw:${string}` {
  return `raw:shelly.component.${key}`;
}
export function componentCapabilities(snapshot: ShellyPresenceDevice): DeviceCapability[] {
  return snapshot.components.flatMap((component) => {
    const capability = componentCapability(component);
    return capability === null ? [] : [capability];
  });
}
function componentCapability(component: ShellyComponent): DeviceCapability | null {
  const virtual = SHELLY_VIRTUAL_COMPONENT.safeParse(component);
  if (virtual.success) return virtualCapability(virtual.data);
  if (component.component === 'bthomesensor')
    return sensorCapability(
      { key: shellyComponentKey(component.key), label: component.config.name ?? component.key },
      component.status?.value,
    );
  return null;
}
function virtualCapability(component: ShellyVirtualComponent): DeviceCapability | null {
  const base = {
    key: shellyComponentKey(component.key),
    label: component.config.name ?? component.key,
  };
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
        value: { kind: 'text', maxLength: component.config.max_len ?? 1024 },
      };
    case 'button':
      return { ...base, access: 'write', value: { kind: 'action', arguments: ['event'] } };
    case 'group':
      return { ...base, access: 'write', value: { kind: 'action', arguments: ['value'] } };
  }
}
function numberCapability(
  component: Extract<ShellyVirtualComponent, { component: 'number' }>,
  base: Pick<DeviceCapability, 'key' | 'label'>,
): DeviceCapability {
  const unit = component.config.meta?.ui?.unit;
  return {
    ...base,
    access: 'read_write',
    value: {
      kind: 'number',
      min: component.config.min ?? -Number.MAX_SAFE_INTEGER,
      max: component.config.max ?? Number.MAX_SAFE_INTEGER,
      step: component.config.meta?.ui?.step ?? 0.000001,
      ...(unit === undefined ? {} : { unit }),
    },
  };
}
function enumCapability(
  component: Extract<ShellyVirtualComponent, { component: 'enum' }>,
  base: Pick<DeviceCapability, 'key' | 'label'>,
): DeviceCapability | null {
  return component.config.options.length === 0
    ? null
    : { ...base, access: 'read_write', value: { kind: 'enum', options: component.config.options } };
}
function sensorCapability(
  base: Pick<DeviceCapability, 'key' | 'label'>,
  value: JsonValue | undefined,
): DeviceCapability | null {
  if (typeof value === 'boolean') return { ...base, access: 'read', value: { kind: 'boolean' } };
  if (typeof value === 'number')
    return {
      ...base,
      access: 'read',
      value: {
        kind: 'number',
        min: -Number.MAX_SAFE_INTEGER,
        max: Number.MAX_SAFE_INTEGER,
        step: 0.000001,
      },
    };
  if (typeof value === 'string')
    return { ...base, access: 'read', value: { kind: 'text', maxLength: 300 } };
  return null;
}
export function projectComponents(
  sink: AdapterSink,
  snapshot: ShellyPresenceDevice,
  observedAt: string,
): void {
  for (const component of snapshot.components) {
    if (!VIRTUAL.has(component.component) && component.component !== 'bthomesensor') continue;
    const status = component.status;
    if (status === null || !('value' in status)) continue;
    sink.state({
      externalId: snapshot.externalId,
      capability: shellyComponentKey(component.key),
      value: snapshot.connection.state === 'online' ? status.value : null,
      observedAt,
    });
  }
}
