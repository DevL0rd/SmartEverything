import { rowsOf } from '../../../store/state';
import { memoOnInputs } from '../../../store/memo-selector';
import { deviceModelOf, type DeviceModel } from '../../devices';

export const homeDeviceModels = memoOnInputs(
  (state) => [state.tables.devices],
  (state): readonly DeviceModel[] =>
    rowsOf(state.tables.devices)
      .filter((device) => !device.hidden)
      .map(deviceModelOf),
);
