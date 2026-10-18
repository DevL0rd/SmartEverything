import { useMemo } from 'react';
import { memoOnInputs } from '../../../store/memo-selector';
import { rowsOf, type Device } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { scaleReadingsOf, type ScaleReadings } from './people';

export function useScaleReadings(device: Device): ScaleReadings {
  const select = useMemo(
    () =>
      memoOnInputs(
        (state) => [state.tables.body_readings, state.tables.profiles],
        (state) =>
          scaleReadingsOf(
            rowsOf(state.tables.body_readings),
            rowsOf(state.tables.profiles),
            device.id,
          ),
      ),
    [device.id],
  );
  return useStoreSelector(select);
}
