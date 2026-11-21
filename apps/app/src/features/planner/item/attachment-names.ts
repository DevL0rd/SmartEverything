import { useMemo } from 'react';
import { memoOnInputs } from '../../../store/memo-selector';
import { useAutomationNames } from '../../../store/selectors';
import { rowsOf, type StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { modelCatalogOf, modelOverrideIndexOf } from '../../models';
import {
  deviceLineOf,
  modelTitleOf,
  type AttachmentNames,
  type DeviceLine,
} from './attachment-chips';

const catalogIn = memoOnInputs(
  (state) => [state.tables.model_catalog],
  (state) => modelCatalogOf(rowsOf(state.tables.model_catalog)),
);

const overridesIn = memoOnInputs(
  (state) => [state.tables.model_overrides],
  (state) => modelOverrideIndexOf(rowsOf(state.tables.model_overrides)),
);

function sameLine(left: DeviceLine | undefined, right: DeviceLine): boolean {
  return (
    left?.label === right.label &&
    left.subtitle === right.subtitle &&
    left.icon === right.icon &&
    left.family === right.family
  );
}

function deviceLinesSelector(): (state: StoreState) => ReadonlyMap<string, DeviceLine> {
  let held: ReadonlyMap<string, DeviceLine> = new Map();
  return memoOnInputs(
    (state) => [
      state.tables.devices,
      state.tables.rooms,
      state.tables.model_catalog,
      state.tables.model_overrides,
    ],
    (state) => {
      const catalog = catalogIn(state);
      const overrides = overridesIn(state);
      const rooms = state.tables.rooms.byId;
      const lines = rowsOf(state.tables.devices).map((device) =>
        deviceLineOf(
          device,
          device.room_id === null ? null : (rooms[device.room_id]?.name ?? null),
          modelTitleOf(device, catalog, overrides),
        ),
      );
      if (held.size === lines.length && lines.every((line) => sameLine(held.get(line.id), line))) {
        return held;
      }
      held = new Map(lines.map((line) => [line.id, line]));
      return held;
    },
  );
}

const deviceLinesIn = deviceLinesSelector();

export function useDeviceLines(): ReadonlyMap<string, DeviceLine> {
  return useStoreSelector(deviceLinesIn);
}

export function useAttachmentNames(): AttachmentNames {
  const devices = useDeviceLines();
  const automations = useAutomationNames();
  return useMemo(() => ({ devices, automations }), [devices, automations]);
}
