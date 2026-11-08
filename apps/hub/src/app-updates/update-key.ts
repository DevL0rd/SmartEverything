import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { ApiError, type AppUpdateKeyReply, type ClientRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { directClient, type Caller } from '../server/auth';
import { accessEntryOf, effectiveClient } from '../server/person-access';
import { RepeatGate } from '../server/repeat-gate';
import type { Store } from '../store/store';

const PURPOSE = 'smarteverything app update manifest';

const rejections = new RepeatGate(30_000);

function macOf(clientId: string, tokenHash: string): Buffer {
  return createHmac('sha256', tokenHash).update(`${PURPOSE}\n${clientId}`).digest();
}

export function appUpdateKeyOf(store: Store, caller: Caller): AppUpdateKeyReply {
  const client = directClient(caller);
  if (client === undefined) {
    throw new ApiError('forbidden', 'Only the paired device itself can read its app update key.');
  }
  const tokenHash = store.clients.tokenHashOf(client.id);
  if (tokenHash === undefined) {
    throw new ApiError('unauthorized', 'This device is no longer paired with the home.');
  }
  return { key: `${client.id}.${macOf(client.id, tokenHash).toString('base64url')}` };
}

function refused(log: Logger, reason: string): ApiError {
  const suppressed = rejections.pass(reason);
  if (suppressed !== null) {
    log.warn('app_update.key_rejected', { reason, suppressedSince: suppressed });
  }
  return new ApiError(
    'unauthorized',
    'Send this device’s app update key in the expo-extra-params header; the app reads it from the home.',
  );
}

function matches(clientId: string, tokenHash: string, mac: string): boolean {
  const expected = macOf(clientId, tokenHash);
  const presented = Buffer.from(mac, 'base64url');
  return presented.length === expected.length && timingSafeEqual(expected, presented);
}

export function clientForUpdateKey(
  store: Store,
  request: IncomingMessage,
  key: string | null,
  log: Logger,
): ClientRow {
  if (key === null) throw refused(log, 'missing');
  const [clientId = '', mac = ''] = key.split('.');
  const tokenHash = store.clients.tokenHashOf(clientId);
  if (tokenHash === undefined) throw refused(log, 'unknown_device');
  if (!matches(clientId, tokenHash, mac)) throw refused(log, 'mismatch');
  const client = store.clients.byId(clientId);
  const effective = effectiveClient(store, client, accessEntryOf(request, false));
  store.clients.seen(client);
  return effective;
}
