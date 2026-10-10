import type { DeviceCommand } from './commands';
import type { DiscoveredDevice, Provider, StateUpdate } from './devices';
import type { DeviceEvent } from './events';
import type { JsonValue } from './values';

export interface AdapterSink {
  readonly state: (update: StateUpdate) => void;
  readonly event: (event: DeviceEvent) => void;
  readonly devices: (devices: readonly DiscoveredDevice[]) => void;
  readonly failure: (failure: AdapterFailure) => void;
}

export interface AdapterFailure {
  readonly provider: Provider;
  readonly externalId: string | null;
  readonly operation: string;
  readonly cause: unknown;
}

export type Unsubscribe = () => Promise<void>;

export interface ProviderAdapter {
  readonly provider: Provider;
  readonly discover: () => Promise<readonly DiscoveredDevice[]>;
  readonly subscribe: (sink: AdapterSink) => Promise<Unsubscribe>;
  readonly execute: (command: DeviceCommand) => Promise<JsonValue>;
  readonly refresh: (externalIds: readonly string[]) => Promise<readonly StateUpdate[]>;
}
