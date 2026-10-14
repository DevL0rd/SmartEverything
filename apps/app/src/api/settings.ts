import {
  API_ENDPOINTS as E,
  PUSH_SERVICE_ACCOUNT,
  type Pairing,
  type PushServiceAccount,
  type Role,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.settings');

export interface HomeChange {
  readonly home_name?: string;
  readonly time_zone?: string;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly location_name?: string | null;
}

export async function updateHome(change: HomeChange): Promise<void> {
  await api().call(E.updateHome, { body: change });
  log.info('home.changed', { fields: Object.keys(change).join(',') });
}

export async function createRoom(name: string, position: number): Promise<void> {
  await api().call(E.createRoom, { body: { name, position } });
  log.info('room.created');
}

export async function renameRoom(roomId: string, name: string): Promise<void> {
  await api().call(E.updateRoom, { params: { roomId }, body: { name } });
  log.info('room.renamed', { roomId });
}

export async function placeRoom(roomId: string, position: number): Promise<void> {
  await api().call(E.updateRoom, { params: { roomId }, body: { position } });
}

export async function removeRoom(roomId: string): Promise<void> {
  await api().call(E.removeRoom, { params: { roomId } });
  log.info('room.removed', { roomId });
}

export async function changeClientRole(clientId: string, role: Role): Promise<void> {
  await api().call(E.updateClient, {
    params: { clientId },
    body: { role },
  });
  log.info('client.role_changed', { clientId, role });
}

export async function removeClient(clientId: string): Promise<void> {
  await api().call(E.removeClient, { params: { clientId } });
  log.info('client.removed', { clientId });
}

export async function startPairing(role: Role): Promise<Pairing> {
  const pairing = await api().call(E.startPairing, {
    body: { role, connectionProtocolVersion: 1 },
  });
  log.info('pairing.started', { role });
  return pairing;
}

export class ServiceAccountError extends Error {
  override readonly name = 'ServiceAccountError';

  constructor(readonly reason: string) {
    super(`That is not a Firebase service account key: ${reason}.`);
  }
}

export function serviceAccountOf(value: unknown): PushServiceAccount {
  const account = PUSH_SERVICE_ACCOUNT.safeParse(value);
  if (!account.success) {
    throw new ServiceAccountError(
      account.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; '),
    );
  }
  return account.data;
}

export async function savePushAccount(serviceAccount: PushServiceAccount): Promise<void> {
  await api().call(E.setPushAccount, { body: { serviceAccount } });
  log.info('push_account.saved');
}

export async function clearPushAccount(): Promise<void> {
  await api().call(E.clearPushAccount, {});
  log.info('push_account.cleared');
}

export async function setClientProfile(clientId: string, profileId: string): Promise<void> {
  await api().call(E.updateClient, { params: { clientId }, body: { profile_id: profileId } });
  log.info('client.profile_changed', { clientId });
}
