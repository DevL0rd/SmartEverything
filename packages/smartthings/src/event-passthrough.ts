import { humanizeKey, type DeviceEvent, type JsonValue } from '@smarteverything/domain';
import { rawAttributeKey } from './keys';
import { attributeValue } from './mapper-kit';
import type { ComponentStatus } from './rest-schemas';
import type { SmartThingsDeviceEvent } from './webhook-messages';

export function passedThroughEvent(
  event: SmartThingsDeviceEvent,
  occurredAt: string,
  previous: ComponentStatus | undefined,
): DeviceEvent | null {
  const { value } = event;
  if (typeof value !== 'string' && typeof value !== 'boolean') {
    return null;
  }
  if (
    previous !== undefined &&
    attributeValue(previous, event.capability, event.attribute) === value
  ) {
    return null;
  }
  const carried: Record<string, JsonValue> = event.data ?? {};
  const data = Object.keys(carried).length === 0 ? {} : { arguments: carried };
  return {
    externalId: event.deviceId,
    kind: 'activity',
    occurredAt,
    details: {
      component: event.componentId,
      value,
      attribute: event.attribute,
      capability: rawAttributeKey(event.componentId, event.capability, event.attribute),
      topic: humanizeKey(event.capability),
      summary: `${humanizeKey(event.attribute)}: ${String(value)}`,
      ...data,
    },
  };
}
