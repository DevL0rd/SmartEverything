import {
  API_ENDPOINTS,
  type ClientRow,
  type DesktopServiceHealth,
  type PublicStatus,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { appPlatform, desktopBridge } from '../../design/platform';
import { ApiClient } from './client';
import { devServerUrl } from './dev-server';
import { connectionPlanOf } from './plan';
import {
  desktopConnection,
  forgetConnection,
  prefersRemoteServer,
  preferRemoteServer,
  readStoredConnection,
  storeConnection,
  type ServerConnection,
  type StoredKind,
} from './storage';
import { rawErrorText } from '../../format/errors';
import type { PairingTarget } from '../pairing-input';
import { ValueStore } from '../../design/external-store';

const log = new Logger('app.connection');

type ConnectionKind = 'desktop' | StoredKind;

export type ConnectionState =
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable'; readonly problem: string }
  | { readonly status: 'unpaired'; readonly kind: StoredKind; readonly fixedUrl: string | null }
  | {
      readonly status: 'paired';
      readonly kind: ConnectionKind;
      readonly connection: ServerConnection;
    }
  | { readonly status: 'removed'; readonly kind: StoredKind; readonly url: string };

export const connectionState = new ValueStore<ConnectionState>({ status: 'loading' });

class NotPairedError extends Error {
  override readonly name = 'NotPairedError';

  constructor(readonly status: ConnectionState['status']) {
    super(`This needs a paired SmartEverything server, and the connection is ${status}.`);
  }
}

class OwnerCannotUnpairError extends Error {
  override readonly name = 'OwnerCannotUnpairError';

  constructor() {
    super('The desktop app owns its server and cannot unpair from it.');
  }
}

class LocalServerNotRunningError extends Error {
  override readonly name = 'LocalServerNotRunningError';

  constructor() {
    super(
      "This computer's SmartEverything server is not running. Start it under Settings → Server service.",
    );
  }
}

function unpairedState(kind: StoredKind): ConnectionState {
  return { status: 'unpaired', kind, fixedUrl: appPlatform() === 'web' ? devServerUrl() : null };
}

let cached: { readonly connection: ServerConnection; readonly client: ApiClient } | null = null;

export function connectionRefused(connection: ServerConnection): void {
  const state = connectionState.get();
  if (state.status !== 'paired' || state.connection !== connection) {
    return;
  }
  log.warn('connection.token_refused', { kind: state.kind });
  if (state.kind === 'desktop') {
    void loadConnection();
    return;
  }
  connectionState.set({ status: 'removed', kind: state.kind, url: connection.url });
}

function clientFor(connection: ServerConnection | null, baseUrl: string): ApiClient {
  return new ApiClient({
    baseUrl,
    token: connection?.token ?? null,
    fetch: (input, init): Promise<Response> => fetch(input, init),
    onUnauthorized: (): void => {
      if (connection !== null) {
        connectionRefused(connection);
      }
    },
  });
}

export function api(): ApiClient {
  const state = connectionState.get();
  if (state.status !== 'paired') {
    throw new NotPairedError(state.status);
  }
  if (cached?.connection !== state.connection) {
    cached = {
      connection: state.connection,
      client: clientFor(state.connection, state.connection.url),
    };
  }
  return cached.client;
}

async function localServerHealth(): Promise<DesktopServiceHealth | null> {
  const bridge = desktopBridge();
  return bridge === null ? null : (await bridge.serviceStatus()).health;
}

async function stateNow(): Promise<ConnectionState> {
  const form = appPlatform();
  const plan = connectionPlanOf({
    form,
    localServer: await localServerHealth(),
    preferRemote: form === 'desktop' && prefersRemoteServer(),
  });
  if (plan.kind === 'local') {
    const connection = await desktopConnection();
    if (connection === null) {
      throw new LocalServerNotRunningError();
    }
    return { status: 'paired', kind: 'desktop', connection };
  }
  const connection = await readStoredConnection(plan.storage);
  return connection === null
    ? unpairedState(plan.storage)
    : { status: 'paired', kind: plan.storage, connection };
}

export async function loadConnection(): Promise<void> {
  try {
    connectionState.set(await stateNow());
  } catch (error) {
    log.error('connection.unreadable', error);
    connectionState.set({ status: 'unavailable', problem: rawErrorText(error) });
  }
}

export interface PairRequest {
  readonly target: PairingTarget;
  readonly name: string;
}

export async function pairWith(request: PairRequest): Promise<ClientRow> {
  const state = connectionState.get();
  if (state.status !== 'unpaired') {
    throw new NotPairedError(state.status);
  }
  const kind = state.kind;
  const run = log.operation('connection.pair', { kind });
  const claimed = await clientFor(null, request.target.url).call(API_ENDPOINTS.claimPairing, {
    body: {
      code: request.target.code,
      name: request.name,
      platform: kind === 'phone' ? 'android' : 'web',
    },
  });
  const connection = { url: request.target.url, token: claimed.token };
  await storeConnection(kind, connection);
  connectionState.set({ status: 'paired', kind, connection });
  run.succeeded({ role: claimed.client.role });
  return claimed.client;
}

export async function forgetServer(): Promise<void> {
  const state = connectionState.get();
  if (state.status !== 'paired' && state.status !== 'removed') {
    return;
  }
  if (state.kind === 'desktop') {
    throw new OwnerCannotUnpairError();
  }
  await forgetConnection(state.kind);
  connectionState.set(unpairedState(state.kind));
  log.info('connection.forgotten', { kind: state.kind });
}

export function checkServer(url: string): Promise<PublicStatus> {
  return clientFor(null, url).call(API_ENDPOINTS.status, {});
}

export async function chooseRemoteServer(): Promise<void> {
  preferRemoteServer(true);
  log.info('connection.remote_chosen');
  await loadConnection();
}

export async function chooseThisComputer(): Promise<void> {
  preferRemoteServer(false);
  log.info('connection.local_chosen');
  await loadConnection();
  const state = connectionState.get();
  if (state.status !== 'paired' || state.kind !== 'desktop') {
    throw new LocalServerNotRunningError();
  }
}
