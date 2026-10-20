import { ORALB_COMPANY_ID, type BrushLinkPlan, type DeviceRow } from '@smarteverything/domain';
import { ORALB_KEY, oralbFullOf, oralbServiceOf } from '@smarteverything/ble';
import type { DeviceState } from '../toothbrush/fleet';
import { entrySettingsOf, oralbSettingsOf } from './config';

const SUBSCRIPTIONS = [
  ORALB_KEY.state,
  ORALB_KEY.mode,
  ORALB_KEY.timer,
  ORALB_KEY.sector,
  ORALB_KEY.face,
  ORALB_KEY.pressure,
  ORALB_KEY.battery,
] as const;

export const READ_KEYS = [
  ORALB_KEY.deviceInfo,
  ORALB_KEY.state,
  ORALB_KEY.battery,
  ORALB_KEY.mode,
  ORALB_KEY.clock,
  ORALB_KEY.modeSlots,
  ORALB_KEY.pacer,
  ORALB_KEY.ringColour,
  ORALB_KEY.head,
  ORALB_KEY.session,
  ORALB_KEY.face,
] as const;

const SYNC = [
  ORALB_KEY.battery,
  ORALB_KEY.face,
  ORALB_KEY.clock,
  ORALB_KEY.session,
  ORALB_KEY.head,
] as const;

function located(key: string): { readonly service: string; readonly characteristic: string } {
  return { service: oralbServiceOf(key) ?? '', characteristic: oralbFullOf(key) };
}

export function planOf(
  device: Pick<DeviceRow, 'id'>,
  state: DeviceState,
  holder: boolean,
): BrushLinkPlan {
  const settings = entrySettingsOf(state.entry);
  const live = settings.policy === 'armed' || oralbSettingsOf(state.entry).live === 'connected';
  return {
    deviceId: device.id,
    address: state.entry.address,
    transport: 'gatt',
    brand: 'oralb',
    bonded: false,
    adverts: { companyId: ORALB_COMPANY_ID },
    prepare: [],
    subscriptions: live
      ? SUBSCRIPTIONS.map((key) => ({ ...located(key), mode: 'notify' as const }))
      : [],
    reads: READ_KEYS.map(located),
    sync: SYNC.map(located),
    initial: [],
    policy: settings.policy,
    holder,
  };
}
