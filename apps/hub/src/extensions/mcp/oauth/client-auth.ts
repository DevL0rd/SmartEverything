import type { IncomingMessage } from 'node:http';
import type { OAuthClientAuth } from '../../../store/repositories/oauth';
import type { Store } from '../../../store/store';
import { single } from '../respond';
import { hashSecret, sameHash } from '../secrets';
import { OAuthError } from './errors';

interface Presented {
  readonly clientId: string;
  readonly secret: string | null;
  readonly method: OAuthClientAuth['authMethod'];
}

function invalidClient(description: string, basic: boolean): OAuthError {
  return new OAuthError(
    401,
    'invalid_client',
    description,
    basic ? { 'www-authenticate': 'Basic realm="SmartEverything"' } : {},
  );
}

function percentDecoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch (cause) {
    throw invalidClient(`The Basic credentials are not percent-encoded: ${String(cause)}.`, true);
  }
}

function fromBasic(header: string): Presented {
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 1) {
    throw invalidClient('The Basic credentials are not client_id:client_secret.', true);
  }
  return {
    clientId: percentDecoded(decoded.slice(0, colon)),
    secret: percentDecoded(decoded.slice(colon + 1)),
    method: 'client_secret_basic',
  };
}

function presented(request: IncomingMessage, form: URLSearchParams): Presented {
  const header = request.headers.authorization;
  if (header?.startsWith('Basic ') === true) {
    return fromBasic(header);
  }
  const clientId = single(form, 'client_id');
  if (clientId === undefined) {
    throw invalidClient('Name the client with client_id, once.', false);
  }
  const secret = single(form, 'client_secret');
  return secret === undefined
    ? { clientId, secret: null, method: 'none' }
    : { clientId, secret, method: 'client_secret_post' };
}

export function authenticateClient(
  store: Store,
  request: IncomingMessage,
  form: URLSearchParams,
): OAuthClientAuth {
  const credentials = presented(request, form);
  const basic = credentials.method === 'client_secret_basic';
  const client = store.oauth.findClient(credentials.clientId);
  if (client === undefined) {
    throw invalidClient('No client is registered with that client_id; register again.', basic);
  }
  if (client.authMethod !== credentials.method) {
    throw invalidClient(
      `The client registered ${client.authMethod} but authenticated with ${credentials.method}.`,
      basic,
    );
  }
  if (
    client.secretHash !== null &&
    (credentials.secret === null || !sameHash(hashSecret(credentials.secret), client.secretHash))
  ) {
    throw invalidClient('The client secret is wrong.', basic);
  }
  return client;
}
