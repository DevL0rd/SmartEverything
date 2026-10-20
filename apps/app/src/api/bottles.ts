import {
  API_ENDPOINTS as E,
  type BottleAction,
  type BottleActResult,
  type BottleAdd,
  type BottleReadQuery,
  type BottleView,
  type BottleUvStartBody,
  type DeviceRow,
} from '@smarteverything/domain';
import { api } from './transport';

type ViewName = BottleView['view'];

export type BottleViewOf<K extends ViewName> = Extract<BottleView, { readonly view: K }>;

class UnexpectedBottleViewError extends Error {
  override readonly name = 'UnexpectedBottleViewError';

  constructor(expected: ViewName, received: ViewName) {
    super(`Expected the bottle view ${expected}, the hub answered ${received}.`);
  }
}

function isView<K extends ViewName>(kind: K, view: BottleView): view is BottleViewOf<K> {
  return view.view === kind;
}

export async function readBottleView<K extends ViewName>(
  deviceId: string,
  kind: K,
  query: Omit<BottleReadQuery, 'view'> = {},
): Promise<BottleViewOf<K>> {
  const view = await api().call(E.readBottle, {
    params: { deviceId },
    query: { ...query, view: kind },
  });
  if (!isView(kind, view)) {
    throw new UnexpectedBottleViewError(kind, view.view);
  }
  return view;
}

export async function actOnBottle(
  deviceId: string,
  action: BottleAction,
): Promise<BottleActResult> {
  return api().call(E.actBottle, { params: { deviceId }, body: action });
}

export async function startBottleUv(
  deviceId: string,
  body: BottleUvStartBody,
): Promise<BottleActResult> {
  return api().call(E.startBottleUv, { params: { deviceId }, body });
}

export async function addBottle(body: BottleAdd): Promise<DeviceRow> {
  return api().call(E.addBottle, { body });
}

export async function forgetBottle(deviceId: string): Promise<void> {
  await api().call(E.forgetBottle, { params: { deviceId } });
}
