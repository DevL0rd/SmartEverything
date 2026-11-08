import { ApiError, type DeviceRow } from '@smarteverything/domain';
import { computerEngine } from '../assistant/engine-kind';
import { hiddenComputer, viewerOf } from '../computers/computer-access';
import type { Caller } from '../server/auth';
import type { Store } from '../store/store';

function computersOf(store: Store, caller: Caller): readonly DeviceRow[] {
  const viewer = viewerOf(store, caller);
  return store.devices
    .list()
    .filter((device) => device.kind === 'computer' && !hiddenComputer(store, viewer, device));
}

function nameOf(device: DeviceRow): string {
  return device.display_name ?? device.name;
}

function listed(computers: readonly DeviceRow[]): string {
  return computers.map((device) => `${nameOf(device)} (deviceId ${device.id})`).join(', ');
}

function chatComputer(store: Store, chatId: string): string | null {
  const engine = store.aiChats.find(chatId)?.engine;
  if (engine === undefined) return null;
  if (engine.kind === 'dsh' && engine.execution_target.kind === 'device')
    return engine.execution_target.device_id;
  return computerEngine(engine)?.device_id ?? null;
}

export function chatServerComputer(
  store: Store,
  caller: Caller,
  chatId: string,
  wanted: string | undefined,
): string {
  const computers = computersOf(store, caller);
  if (wanted !== undefined) {
    const lowered = wanted.toLowerCase();
    const match = computers.filter(
      (device) => device.id === wanted || nameOf(device).toLowerCase() === lowered,
    );
    if (match.length === 1 && match[0] !== undefined) return match[0].id;
    throw new ApiError(
      'not_found',
      `${wanted} is not one computer you can reach; computers: ${listed(computers) || 'none'}.`,
    );
  }
  const own = chatComputer(store, chatId);
  if (own !== null && computers.some((device) => device.id === own)) return own;
  const [only, second] = computers;
  if (only === undefined) throw new ApiError('not_found', 'This home has no computer.');
  if (second !== undefined)
    throw new ApiError('invalid_request', `Say which computer: ${listed(computers)}.`);
  return only.id;
}
