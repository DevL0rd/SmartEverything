import { useMemo } from 'react';
import { slotOf } from '../../../store/command-ledger';
import { sameJson } from '../../../store/same-json';
import { ledgerEntry } from '../../../store/subscriptions';
import { deviceValuesOf, type Device, type StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { visualStateOf } from '../../device-visuals';
import { useDeviceModel, type DeviceModel } from '../model/device-model';
import { displayNameOf } from '../model/display-name';
import { lightCommandsOf, type LightCommands } from '../model/light-commands';
import { lightPartsOf, lightStateOf, type LightParts, type LightState } from '../model/light-state';

export interface LightView {
  readonly device: Device;
  readonly model: DeviceModel;
  readonly parts: LightParts;
  readonly name: string;
  readonly state: LightState;
  readonly colour: string | null;
  readonly failed: boolean;
  readonly waiting: boolean;
}

type LightRead = Pick<LightView, 'name' | 'state' | 'colour' | 'failed' | 'waiting'>;

function sameLight(left: LightRead, right: LightRead): boolean {
  return (
    left.name === right.name &&
    left.colour === right.colour &&
    left.failed === right.failed &&
    left.waiting === right.waiting &&
    sameJson(left.state, right.state)
  );
}

function commandsOf(state: StoreState, deviceId: string, parts: LightParts): LightCommands {
  const keys = ['power', parts.brightness?.key, parts.temperature?.key, parts.colour?.key];
  return lightCommandsOf(
    keys.flatMap((key) => {
      const entry = key === undefined ? undefined : ledgerEntry(state, slotOf(deviceId, key));
      return entry === undefined ? [] : [entry];
    }),
  );
}

export function useLight(device: Device): LightView {
  const model = useDeviceModel(device);
  const parts = useMemo(() => lightPartsOf(model), [model]);
  const read = useStoreSelector(
    (state): LightRead => {
      const values = deviceValuesOf(state, device.id);
      return {
        name: displayNameOf(state, device.id),
        colour: visualStateOf(device, values).colour,
        state: lightStateOf(model, parts, values),
        ...commandsOf(state, device.id, parts),
      };
    },
    sameLight,
    [device, model, parts],
  );
  return { device, model, parts, ...read };
}

export function lightLabel({ name, state }: Pick<LightView, 'name' | 'state'>): string {
  if (!state.online) {
    return `${name}, offline`;
  }
  if (state.power === 'off') {
    return `${name}, off`;
  }
  return state.level === null ? `${name}, on` : `${name}, on, ${String(state.level)} percent`;
}
