import {
  ApiError,
  REFILL_ITEM,
  REFILL_STATE,
  deviceFamily,
  respondsToSignal,
  type ButtonAction,
  type DeviceRow,
  type JsonValue,
  type LaundryNoticeChange,
  type LaundryNoticeSetting,
} from '@smarteverything/domain';
import { clientOf, type Caller } from '../server/auth';
import type { RunningHub } from '../hub';
import { eventSignal } from '../signals/sources/device';
import type { Store } from '../store/store';

type PressStore = Pick<Store, 'automations'>;

function originOf(caller: Caller): Readonly<Record<string, JsonValue>> {
  return caller.kind === 'client' && caller.via !== 'assistant'
    ? { source: 'app', requestedBy: clientOf(caller).id }
    : { source: 'assistant' };
}

function pressedAutomations(
  store: PressStore,
  device: DeviceRow,
  details: Readonly<Record<string, JsonValue>>,
): { id: string; name: string }[] {
  const signal = eventSignal({
    id: device.id,
    deviceId: device.id,
    kind: 'button',
    occurredAt: new Date().toISOString(),
    details,
  });
  return store.automations
    .list()
    .filter((automation) => automation.enabled && respondsToSignal(automation.definition, signal))
    .map(({ id, name }) => ({ id, name }));
}

export async function pressDeviceButton(
  context: { readonly store: PressStore; readonly hub: Pick<RunningHub, 'recordEvent'> },
  device: DeviceRow,
  action: ButtonAction,
  caller: Caller,
): Promise<{ automations: { id: string; name: string }[] }> {
  if (deviceFamily(device) !== 'button') {
    throw new ApiError('invalid_request', `${device.name} is not a wireless button.`);
  }
  const details = { action, ...originOf(caller) };
  await context.hub.recordEvent({ deviceId: device.id, kind: 'button', details });
  return { automations: pressedAutomations(context.store, device, details) };
}

export async function recordRefill(
  context: {
    readonly store: Pick<Store, 'settings'>;
    readonly hub: Pick<RunningHub, 'recordEvent'>;
  },
  device: DeviceRow,
  caller: Caller,
): Promise<void> {
  if (deviceFamily(device) !== 'diffuser') {
    throw new ApiError('invalid_request', `${device.name} does not hold a fragrance.`);
  }
  context.store.settings.recordRefill(device.id);
  await context.hub.recordEvent({
    deviceId: device.id,
    kind: 'maintenance',
    details: { item: REFILL_ITEM, state: REFILL_STATE, ...originOf(caller) },
  });
}

export function changeLaundryNotices(
  store: Pick<Store, 'settings'>,
  device: DeviceRow,
  change: LaundryNoticeChange,
): LaundryNoticeSetting {
  if (deviceFamily(device) !== 'laundry') {
    throw new ApiError('invalid_request', `${device.name} is not a washing machine or dryer.`);
  }
  return store.settings.changeLaundryNotice(device.id, change);
}
