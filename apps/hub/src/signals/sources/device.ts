import {
  deviceFamily,
  presentCapability,
  type DeviceCapability,
  type DeviceKind,
  type DeviceLifecycleChange,
  type DeviceStateCause,
  type JsonValue,
  type Provider,
  type SignalInput,
  type StateChange,
} from '@smarteverything/domain';
import type { RecordedEvent } from '../../state/event-router';

export interface DeviceFactsSource {
  readonly provider: Provider;
  readonly kind: DeviceKind;
  readonly model: string;
  readonly name: string;
  readonly roomId: string | null;
  readonly capabilities: readonly DeviceCapability[];
}

function factsOf(device: DeviceFactsSource): Record<string, JsonValue> {
  return {
    family: deviceFamily(device),
    kind: device.kind,
    roomId: device.roomId,
    provider: device.provider,
    name: device.name,
  };
}

function optional(key: string, value: string | null | undefined): Record<string, JsonValue> {
  return value === null || value === undefined ? {} : { [key]: value };
}

function valueFactsOf(device: DeviceFactsSource, capability: string): Record<string, JsonValue> {
  const declared = device.capabilities.find((entry) => entry.key === capability);
  const presented = declared === undefined ? undefined : presentCapability(device, declared);
  return { ...optional('role', presented?.role), ...optional('unit', presented?.unit) };
}

export interface StateSignalInput {
  readonly change: StateChange;
  readonly device: DeviceFactsSource;
  readonly cause: DeviceStateCause;
  readonly at: string;
}

export function stateSignal({ change, device, cause, at }: StateSignalInput): SignalInput {
  return {
    source: 'device',
    kind: 'state',
    subject: change.deviceId,
    field: change.capability,
    value: change.value,
    previous: change.previous ?? null,
    at,
    profileId: null,
    data: { ...factsOf(device), ...valueFactsOf(device, change.capability), cause },
  };
}

export function onlineSignal(
  deviceId: string,
  device: DeviceFactsSource,
  online: boolean,
  at: string,
): SignalInput {
  return {
    source: 'device',
    kind: 'online',
    subject: deviceId,
    field: null,
    value: online,
    previous: null,
    at,
    profileId: null,
    data: factsOf(device),
  };
}

export interface LifecycleSignalInput {
  readonly deviceId: string;
  readonly device: DeviceFactsSource;
  readonly change: DeviceLifecycleChange;
  readonly detail: Readonly<Record<string, JsonValue>>;
  readonly at: string;
}

export function lifecycleSignal(input: LifecycleSignalInput): SignalInput {
  const { deviceId, device, change, detail, at } = input;
  return {
    source: 'device',
    kind: 'lifecycle',
    subject: deviceId,
    field: null,
    value: true,
    previous: null,
    at,
    profileId: null,
    data: { ...detail, ...factsOf(device), change },
  };
}

export function eventSignal(event: RecordedEvent): SignalInput {
  return {
    source: 'event',
    kind: event.kind,
    subject: event.deviceId,
    field: null,
    value: true,
    previous: null,
    at: event.occurredAt,
    profileId: null,
    data: { ...event.details, eventId: event.id },
  };
}
