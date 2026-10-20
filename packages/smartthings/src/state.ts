import type { DeviceEvent, JsonValue, StateUpdate } from '@smarteverything/domain';
import type { Binding } from './bindings';
import type { SmartThingsDeviceEvent } from './webhook-messages';
import { passedThroughEvent } from './event-passthrough';
import { SMARTTHINGS_EVENT_MAPPINGS, type SmartThingsEventMapping } from './event-registry';
import { attributeValue } from './mapper-kit';
import { rawAttributeKey } from './keys';
import type { ComponentStatus } from './rest-schemas';
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

function bindingsTouched(state: DeviceState, event: SmartThingsDeviceEvent): readonly Binding[] {
  return state.bindings.filter(
    (binding) =>
      binding.component === event.componentId &&
      binding.sources.some(
        (source) => source.capability === event.capability && source.attribute === event.attribute,
      ),
  );
}

export function reportsAttribute(state: DeviceState, event: SmartThingsDeviceEvent): boolean {
  return bindingsTouched(state, event).length > 0;
}

export function statesForEvent(
  state: DeviceState,
  event: SmartThingsDeviceEvent,
  observedAt: string,
): readonly StateUpdate[] {
  return updatesFor(state, bindingsTouched(state, event), observedAt);
}

export function deviceEventsFor(
  event: SmartThingsDeviceEvent,
  occurredAt: string,
  previous?: ComponentStatus,
  unreported = false,
): readonly DeviceEvent[] {
  if (event.stateChange === false) {
    return [];
  }
  const mapping = SMARTTHINGS_EVENT_MAPPINGS[`${event.capability}.${event.attribute}`];
  const mapped =
    mapping === undefined
      ? unreported
        ? passedThroughEvent(event, occurredAt, previous)
        : null
      : registeredEvent(mapping, event, occurredAt, previous);
  return mapped === null ? [] : [mapped];
}

function registeredEvent(
  mapping: SmartThingsEventMapping,
  event: SmartThingsDeviceEvent,
  occurredAt: string,
  previous: ComponentStatus | undefined,
): DeviceEvent | null {
  const repeated =
    mapping.changesOnly === true &&
    previous !== undefined &&
    attributeValue(previous, event.capability, event.attribute) === event.value;
  const wanted = mapping.values === undefined || mapping.values.includes(event.value);
  const details = repeated || !wanted ? null : eventDetails(event, mapping);
  return details === null
    ? null
    : { externalId: event.deviceId, kind: mappedKind(mapping, event.value), occurredAt, details };
}

function eventDetails(
  event: SmartThingsDeviceEvent,
  mapping: SmartThingsEventMapping,
): Readonly<Record<string, JsonValue>> | null {
  const details = { component: event.componentId, value: event.value };
  if (mapping.summaries === undefined) {
    return details;
  }
  const value = event.value;
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return null;
  }
  const summary = mapping.summaries[String(value)];
  return summary === undefined
    ? null
    : {
        ...details,
        summary,
        topic: mapping.topic,
        capability: rawAttributeKey(event.componentId, event.capability, event.attribute),
      };
}

export function isOnlineHealth(status: string): boolean {
  return status === ONLINE_HEALTH;
}

function mappedKind(mapping: SmartThingsEventMapping, value: JsonValue): DeviceEvent['kind'] {
  if (typeof value !== 'string' && typeof value !== 'boolean' && typeof value !== 'number') {
    return mapping.kind;
  }
  return mapping.kinds?.[String(value)] ?? mapping.kind;
}
