import type { PhoneDetail, PhoneReport } from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import { nextContext } from './phone-context';
import type { PhoneIdentity } from './phone-device';

export interface PhoneContextStep {
  readonly device: string;
  readonly phone: PhoneIdentity;
  readonly report: PhoneReport;
}

export const PHONE_CONTEXT_UNIT = storeUnit((store, step: PhoneContextStep): void => {
  const previous = store.phoneContexts.byDevice(step.device);
  store.phoneContexts.save(nextContext({ ...step, previous }));
});

export interface PhoneDetailRow {
  readonly deviceId: string;
  readonly detail: PhoneDetail;
}

export const PHONE_DETAIL_ROWS_UNIT = storeUnit((store, _input: null): PhoneDetailRow[] =>
  store.devices
    .list()
    .filter((device) => device.kind === 'phone')
    .map((device) => ({ deviceId: device.id, detail: store.phoneDetails.read(device.id) })),
);
