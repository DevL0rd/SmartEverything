import { targetState, type DeviceTarget, type TargetState } from '@smarteverything/domain';
import { memoOnInputs } from '../../store/memo-selector';
import { sameJson } from '../../store/same-json';
import type { Device, DeviceValues, StoreState } from '../../store/state';
import { deviceValuesRecord } from '../../store/subscriptions';
import { useStoreSelector } from '../../store/store-context';
import { deviceModelOf } from '../devices';
import { visualStateOf } from '../device-visuals';
import { RESTING_COLOUR } from './white-colour';
import { membersSelector } from './use-target-members';

export type MemberPower = 'on' | 'off' | 'offline';

export interface TargetView {
  readonly state: TargetState;
  readonly colours: Readonly<Record<string, string>>;
  readonly resting: Readonly<Record<string, string>>;
  readonly powers: Readonly<Record<string, MemberPower>>;
}

const NOTHING: TargetView = {
  state: {
    members: 0,
    online: 0,
    on: 0,
    power: 'none',
    level: null,
    whiteTemperature: null,
    colours: [],
    support: {},
  },
  colours: {},
  resting: {},
  powers: {},
};

const SELECTORS = new Map<string, (state: StoreState) => TargetView>();

function powerOf(device: Device, values: DeviceValues | undefined): MemberPower {
  if (!device.online) return 'offline';
  const power = deviceModelOf(device).power;
  return power !== null && values?.[power.key]?.value === true ? 'on' : 'off';
}

function viewOf(
  summary: TargetState,
  members: readonly Device[],
  valuesOf: (deviceId: string) => DeviceValues | undefined,
): TargetView {
  const colours: Record<string, string> = {};
  const resting: Record<string, string> = {};
  const powers: Record<string, MemberPower> = {};
  for (const device of members) {
    const values = valuesOf(device.id);
    const power = powerOf(device, values);
    powers[device.id] = power;
    const colour = visualStateOf(device, values ?? {}).colour;
    resting[device.id] = colour ?? RESTING_COLOUR;
    if (power === 'on' && colour !== null) colours[device.id] = colour;
  }
  return { state: summary, colours, resting, powers };
}

function buildSelector(target: DeviceTarget): (state: StoreState) => TargetView {
  const members = membersSelector(target);
  return memoOnInputs(
    (state) => {
      const found = members(state);
      return found.status === 'removed'
        ? [found]
        : [found, ...found.members.map((device) => deviceValuesRecord(state, device.id))];
    },
    (state) => {
      const found = members(state);
      if (found.status === 'removed') return NOTHING;
      const valuesOf = (deviceId: string): DeviceValues | undefined =>
        deviceValuesRecord(state, deviceId);
      const summary = targetState(
        found.members,
        valuesOf,
        (device) => deviceModelOf(device).presentation,
      );
      return viewOf(summary, found.members, valuesOf);
    },
  );
}

export function viewSelector(target: DeviceTarget): (state: StoreState) => TargetView {
  const key = JSON.stringify(target);
  const known = SELECTORS.get(key);
  if (known !== undefined) return known;
  const selector = buildSelector(target);
  SELECTORS.set(key, selector);
  return selector;
}

export function useTargetView(target: DeviceTarget): TargetView {
  return useStoreSelector(viewSelector(target), sameJson);
}
