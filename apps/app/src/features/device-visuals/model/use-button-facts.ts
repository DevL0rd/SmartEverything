import { useMemo } from 'react';
import { deviceFamily } from '@smarteverything/domain';
import { sameJson } from '../../../store/same-json';
import { rowsOf, type Device } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { buttonFactsOf } from './button-facts';
import { useDeviceVisualState } from './use-visual-state';
import type { HubFacts, VisualState } from '../types';

export function useButtonVisualState(device: Device): VisualState {
  const base = useDeviceVisualState(device);
  const button = useStoreSelector(
    (state) => buttonFactsOf(rowsOf(state.tables.events), device.id),
    sameJson,
    [device.id],
  );
  return useMemo(() => ({ ...base, button }), [base, button]);
}

export function useHubVisualState(device: Device): VisualState {
  const base = useDeviceVisualState(device);
  const hub = useStoreSelector(
    (state): HubFacts => ({
      children: rowsOf(state.tables.devices).filter(
        (row) => row.parent_id === device.id && deviceFamily(row) === 'button',
      ).length,
    }),
    sameJson,
    [device.id],
  );
  return useMemo(() => ({ ...base, hub }), [base, hub]);
}
