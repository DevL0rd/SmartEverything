import type { DeviceCapability, JsonValue, RawCapability } from '@smarteverything/domain';
import type { AttributeSource, CommandCall, ReadValue } from './mapper-kit';

export interface SmartThingsCommand {
  readonly component: string;
  readonly capability: string;
  readonly command: string;
  readonly arguments?: readonly JsonValue[];
}

export interface Binding {
  readonly capability: DeviceCapability;
  readonly component: string;
  readonly sources: readonly AttributeSource[];
  readonly read: ReadValue;
  readonly write: ((value: JsonValue) => readonly SmartThingsCommand[]) | null;
}

export interface RawBinding extends Binding {
  readonly capability: Omit<DeviceCapability, 'key'> & { readonly key: RawCapability };
}

export function inComponent(
  component: string,
  calls: readonly CommandCall[],
): readonly SmartThingsCommand[] {
  return calls.map((entry) => ({ component, ...entry }));
}
