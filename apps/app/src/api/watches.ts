import {
  API_ENDPOINTS as E,
  type WatchActionRequest,
  type WatchActionResult,
  type WatchBridge,
  type WatchDayRow,
} from '@smarteverything/domain';
import { api } from './transport';

export async function readWatchDays(from: string, to: string): Promise<readonly WatchDayRow[]> {
  return (await api().call(E.readWatchDays, { query: { from, to } })).days;
}

export async function runWatchAction(
  deviceId: string,
  action: WatchActionRequest,
): Promise<WatchActionResult> {
  return api().call(E.runWatchAction, { params: { deviceId }, body: action });
}

export async function takeOverWatchBridge(deviceId: string): Promise<WatchBridge> {
  return api().call(E.takeOverWatchBridge, { params: { deviceId } });
}
