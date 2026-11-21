import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../../../store/store';
import { readForm, replyEmpty, single } from '../respond';
import { hashSecret } from '../secrets';
import { authenticateClient } from './client-auth';
import { invalidRequest } from './errors';

export async function revokeToken(
  store: Store,
  log: Logger,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const form = await readForm(request);
  const client = await authenticateClient(store, request, form);
  const token = single(form, 'token');
  if (token === undefined) {
    throw invalidRequest('Send the token to revoke exactly once.');
  }
  const row = await store.host.call('oauth', 'token', hashSecret(token));
  if (row?.client_id === client.row.id) {
    if (row.kind === 'refresh') {
      await store.host.call('oauth', 'revokeFamily', row.family);
    } else {
      await store.host.call('oauth', 'revokeToken', row.token_hash);
    }
    log.info('token.revoked', { clientId: client.row.id, kind: row.kind });
  }
  replyEmpty(response, 200);
}
