import type { DeviceEvent, JsonValue, StateUpdate } from '@smarteverything/domain';
import type { Binding } from './bindings';
import type { SmartThingsDeviceEvent } from './webhook-messages';
import type { DeviceStatus } from './rest-schemas';

const ONLINE_HEALTH = 'ONLINE';

export type StatusByComponent = DeviceStatus['components'];

export interface DeviceState {
  readonly externalId: string;
  readonly bindings: readonly Binding[];
  readonly status: StatusByComponent;
}

function valueOf(binding: Binding, status: StatusByComponent): JsonValue | undefined {
  const component = status[binding.component];
  return component === undefined ? undefined : binding.read(component);
}

function updatesFor(
  state: DeviceState,
  bindings: readonly Binding[],
  observedAt: string,
): readonly StateUpdate[] {
  return bindings.flatMap((binding) => {
    const value = valueOf(binding, state.status);
    return value === undefined
      ? []
      : [{ externalId: state.externalId, capability: binding.capability.key, value, observedAt }];
  });
}

export function statesOf(state: DeviceState, observedAt: string): readonly StateUpdate[] {
  return updatesFor(state, state.bindings, observedAt);
}

export function withEvent(
  status: StatusByComponent,
  event: SmartThingsDeviceEvent,
): StatusByComponent {
  const component = status[event.componentId] ?? {};
  const capability = component[event.capability] ?? {};
  const unit = event.unit ?? capability[event.attribute]?.unit ?? null;
  return {
    ...status,
    [event.componentId]: {
      ...component,
      [event.capability]: { ...capability, [event.attribute]: { value: event.value, unit } },
    },
  };
}

export function statesForEvent(
  state: DeviceState,
  event: SmartThingsDeviceEvent,
  observedAt: string,
): readonly StateUpdate[] {
  const touched = state.bindings.filter(
    (binding) =>
      binding.component === event.componentId &&
      binding.sources.some(
        (source) => source.capability === event.capability && source.attribute === event.attribute,
      ),
  );
  return updatesFor(state, touched, observedAt);
}

const ALERTS: readonly (readonly [string, string, readonly JsonValue[], DeviceEvent['kind']])[] = [
  ['motionSensor', 'motion', ['active'], 'motion'],
  ['waterSensor', 'water', ['wet'], 'leak'],
  ['smokeDetector', 'smoke', ['detected', 'tested'], 'smoke'],
];

export function deviceEventsFor(
  event: SmartThingsDeviceEvent,
  occurredAt: string,
): readonly DeviceEvent[] {
  if (event.stateChange === false) {
    return [];
  }
  const details = { component: event.componentId, value: event.value };
  if (event.capability === 'button' && event.attribute === 'button') {
    return [{ externalId: event.deviceId, kind: 'button', occurredAt, details }];
  }
  const alert = ALERTS.find(
    ([capability, attribute, values]) =>
      capability === event.capability &&
      attribute === event.attribute &&
      values.includes(event.value),
  );
  return alert === undefined
    ? []
    : [{ externalId: event.deviceId, kind: alert[3], occurredAt, details }];
}

export function isOnlineHealth(status: string): boolean {
  return status === ONLINE_HEALTH;
}
