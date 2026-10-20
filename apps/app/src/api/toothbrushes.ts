import {
  API_ENDPOINTS as E,
  type BrushAction,
  type BrushActionResult,
  type BrushGattDump,
  type BrushReadQuery,
  type BrushView,
  type DeviceRow,
} from '@smarteverything/domain';
import { api } from './transport';

type ViewName = BrushView['view'];

export type BrushViewOf<K extends ViewName> = Extract<BrushView, { readonly view: K }>;

class UnexpectedBrushViewError extends Error {
  override readonly name = 'UnexpectedBrushViewError';

  constructor(expected: ViewName, received: ViewName) {
    super(`Expected the toothbrush view ${expected}, the hub answered ${received}.`);
  }
}

function isView<K extends ViewName>(kind: K, view: BrushView): view is BrushViewOf<K> {
  return view.view === kind;
}

export async function readBrushView<K extends ViewName>(
  deviceId: string,
  kind: K,
  query: Omit<BrushReadQuery, 'view'> = {},
): Promise<BrushViewOf<K>> {
  const view = await api().call(E.readToothbrush, {
    params: { deviceId },
    query: { ...query, view: kind },
  });
  if (!isView(kind, view)) {
    throw new UnexpectedBrushViewError(kind, view.view);
  }
  return view;
}

export async function actOnBrush(
  deviceId: string,
  action: BrushAction,
): Promise<BrushActionResult> {
  return api().call(E.actToothbrush, { params: { deviceId }, body: action });
}

export interface NewBrush {
  readonly name: string;
  readonly address: string;
  readonly room: string | null;
  readonly profileId: string | null;
  readonly modelKey: string | null;
  readonly bonded: boolean;
  readonly gatt: BrushGattDump;
}

export async function addBrush(brush: NewBrush): Promise<DeviceRow> {
  return api().call(E.addLocalDevice, {
    body: {
      driver: 'philips_sonicare',
      source: 'bluetooth',
      name: brush.name,
      address: brush.address,
      room: brush.room,
      profileId: brush.profileId,
      modelKey: brush.modelKey,
      bonded: brush.bonded,
      gatt: brush.gatt,
    },
  });
}
