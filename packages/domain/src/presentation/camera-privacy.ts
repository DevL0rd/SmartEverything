import type { DeviceCapability } from '../devices';
import type { JsonValue } from '../values';

export interface PrivacySwitch {
  readonly key: 'privacy_mode' | 'power';
  readonly privateWhen: boolean;
  readonly writable: boolean;
}

function booleanCapability(
  capabilities: readonly DeviceCapability[],
  key: PrivacySwitch['key'],
): DeviceCapability | undefined {
  return capabilities.find(
    (capability) => capability.key === key && capability.value.kind === 'boolean',
  );
}

export function privacySwitchOf(device: {
  readonly capabilities: readonly DeviceCapability[];
}): PrivacySwitch | null {
  const privacy = booleanCapability(device.capabilities, 'privacy_mode');
  if (privacy !== undefined) {
    return { key: 'privacy_mode', privateWhen: true, writable: privacy.access !== 'read' };
  }
  const power = booleanCapability(device.capabilities, 'power');
  return power === undefined
    ? null
    : { key: 'power', privateWhen: false, writable: power.access !== 'read' };
}

export function isPrivate(privacy: PrivacySwitch, value: JsonValue | undefined): boolean {
  return value === privacy.privateWhen;
}
