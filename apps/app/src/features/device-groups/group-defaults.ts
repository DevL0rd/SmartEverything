import { z } from 'zod';
import {
  JSON_VALUE,
  deviceFamily,
  targetKey,
  type DeviceGroupRow,
  type DeviceRow,
  type DeviceTarget,
} from '@smarteverything/domain';
import type { BoardWidget } from '../../components/widget-board';
import { memoOnInputs } from '../../store/memo-selector';
import { sameJson } from '../../store/same-json';
import { rowsOf } from '../../store/state';
import { useStoreSelector } from '../../store/store-context';
import { DEVICE_GROUP_TYPE } from './device-group-widget';

export interface LightGroupDefault {
  readonly groupId: string;
}

const DEFAULT_GROUPS_AT_MOST = 3;
const MIN_LIGHTS = 2;

export function lightGroupDefaults(
  devices: readonly DeviceRow[],
  groups: readonly DeviceGroupRow[],
): readonly LightGroupDefault[] {
  return groups
    .flatMap((group) => {
      const members = devices.filter((device) => group.device_ids.includes(device.id));
      return members.length >= MIN_LIGHTS &&
        members.every((device) => deviceFamily(device) === 'light')
        ? [{ groupId: group.id }]
        : [];
    })
    .slice(0, DEFAULT_GROUPS_AT_MOST);
}

export const selectLightGroupDefaults = memoOnInputs(
  (state) => [state.tables.devices, state.tables.device_groups],
  (state) => lightGroupDefaults(rowsOf(state.tables.devices), rowsOf(state.tables.device_groups)),
);

export function useLightGroupDefaults(): readonly LightGroupDefault[] {
  return useStoreSelector(selectLightGroupDefaults, sameJson);
}

const WIDGET_OPTIONS = z.record(z.string(), JSON_VALUE);

export function targetBoardWidget(target: DeviceTarget): BoardWidget {
  return {
    key: targetKey(target),
    type: DEVICE_GROUP_TYPE,
    size: 'XL',
    options: WIDGET_OPTIONS.parse({ target }),
  };
}

export function lightGroupWidgets(defaults: readonly LightGroupDefault[]): readonly BoardWidget[] {
  return defaults.map((item) => targetBoardWidget({ kind: 'group', groupId: item.groupId }));
}
