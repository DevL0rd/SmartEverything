import {
  API_ENDPOINTS as E,
  type DeviceRow,
  type TreadmillGattDump,
  type TreadmillAction,
  type TreadmillActionResult,
  type TreadmillReadQuery,
  type TreadmillView,
} from '@smarteverything/domain';
import { api } from './transport';

type ViewName = TreadmillView['view'];

export type TreadmillViewOf<K extends ViewName> = Extract<TreadmillView, { readonly view: K }>;

class UnexpectedTreadmillViewError extends Error {
  override readonly name = 'UnexpectedTreadmillViewError';

  constructor(expected: ViewName, received: ViewName) {
    super(`Expected the treadmill view ${expected}, the hub answered ${received}.`);
  }
}

function isView<K extends ViewName>(kind: K, view: TreadmillView): view is TreadmillViewOf<K> {
  return view.view === kind;
}

export async function readTreadmillView<K extends ViewName>(
  deviceId: string,
  kind: K,
  query: Omit<TreadmillReadQuery, 'view'> = {},
): Promise<TreadmillViewOf<K>> {
  const view = await api().call(E.readTreadmill, {
    params: { deviceId },
    query: { ...query, view: kind },
  });
  if (!isView(kind, view)) {
    throw new UnexpectedTreadmillViewError(kind, view.view);
  }
  return view;
}

export async function actOnTreadmill(
  deviceId: string,
  action: TreadmillAction,
): Promise<TreadmillActionResult> {
  return api().call(E.actTreadmill, { params: { deviceId }, body: action });
}

export interface NewTreadmill {
  readonly name: string;
  readonly address: string;
  readonly room: string | null;
  readonly gatt: TreadmillGattDump;
}

export async function addTreadmill(treadmill: NewTreadmill): Promise<DeviceRow> {
  return api().call(E.addLocalDevice, {
    body: {
      driver: 'kingsmith_treadmill',
      source: 'bluetooth',
      name: treadmill.name,
      address: treadmill.address,
      room: treadmill.room,
      gatt: treadmill.gatt,
    },
  });
}
