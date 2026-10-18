import type { DesktopServiceHealth } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
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
  type ServerConnection,
  type StoredKind,
} from './storage';
import { rawErrorText } from '../../format/errors';
import { ValueStore } from '../../design/external-store';
import { routeFor, stopHubRoute } from './active-route';
import { trackNativeActivation } from './route-platform';
import { StaleHubRouteError } from './route-policy';
import {
  activateNativeServerEnrollment,
  clearNativeServerCredential,
} from '../../../modules/health-connect/src/hub-network';
import { forgetHubTrust } from './trust-storage';
import { failureFacts, nowMs } from './request-log';
import { cancelPairingSession, type PairingHost, type PairingRun } from './pairing-session';

const log = new Logger('app.connection');

export type ConnectionState =
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable'; readonly problem: string }
  | { readonly status: 'unpaired'; readonly kind: StoredKind; readonly fixedUrl: string | null }
  | {
      readonly status: 'paired';
      readonly kind: StoredKind;
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
  const fixedUrl =
    appPlatform() === 'web'
      ? (devServerUrl() ?? (window.location.protocol === 'https:' ? window.location.origin : null))
      : null;
  return { status: 'unpaired', kind, fixedUrl };
}

let connectionOperation = 0;

let cached: { readonly connection: ServerConnection; readonly client: ApiClient } | null = null;

export function connectionRefused(connection: ServerConnection): void {
  const state = connectionState.get();
  if (state.status !== 'paired' || state.connection !== connection) {
    return;
  }
  connectionOperation += 1;
  stopHubRoute();
  void clearNativeServerCredential(connection.token).catch((error: unknown) => {
    log.warn('connection.native_credential_clear_failed', failureFacts(error));
  });
  void forgetHubTrust().catch((error: unknown) => {
    log.warn('connection.trust_cache_clear_failed', failureFacts(error));
  });
  log.warn('connection.token_refused', { kind: state.kind });
  if (state.kind === 'desktop') {
    background(
      forgetConnection('desktop')
        .catch((error: unknown) => {
          log.warn('connection.window_forget_failed', failureFacts(error));
        })
        .then(loadConnection),
      'connection.forget_failed',
    );
    return;
  }
  connectionState.set({ status: 'removed', kind: state.kind, url: connection.url });
}

function routeLease(
  connection: ServerConnection,
  media = false,
): ReturnType<ReturnType<typeof routeFor>['lease']> {
  const state = connectionState.get();
  if (state.status !== 'paired' || state.connection !== connection)
    throw new StaleHubRouteError('GET');
  return routeFor(connection).lease(media);
}

function clientFor(connection: ServerConnection | null, baseUrl: string): ApiClient {
  return new ApiClient({
    baseUrl,
    token: connection?.token ?? null,
    fetch: (input, init): Promise<Response> => fetch(input, init),
    ...(connection === null
      ? {}
      : {
          ready: (): Promise<void> => {
            const state = connectionState.get();
            if (state.status !== 'paired' || state.connection !== connection)
              throw new StaleHubRouteError('GET');
            return routeFor(connection).ready();
          },
          route: () => routeLease(connection),
          mediaRoute: () => routeLease(connection, true),
        }),
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
  const preferRemote = form === 'desktop' && prefersRemoteServer();
  const localServer = form === 'desktop' && !preferRemote ? await localServerHealth() : null;
  const plan = connectionPlanOf({ form, localServer, preferRemote });
  log.debug('connection.planned', {
    form,
    preferRemote,
    localServerChecked: form === 'desktop' && !preferRemote,
    localServerUp: localServer !== null,
    plan: plan.kind,
    storage: plan.kind === 'local' ? 'desktop' : plan.storage,
  });
  if (plan.kind === 'local') {
    const connection = await desktopConnection();
    return connection === null
      ? unpairedState('desktop')
      : { status: 'paired', kind: 'desktop', connection };
  }
  const connection = await readStoredConnection(plan.storage);
  return connection === null
    ? unpairedState(plan.storage)
    : { status: 'paired', kind: plan.storage, connection };
}

function activateEnrollment(connection: ServerConnection, run: number): void {
  const startedAt = nowMs();
  log.debug('connection.activation_started', { run });
  const task = activateNativeServerEnrollment(connection.url, connection.token, {
    isCurrent: (): boolean => run === connectionOperation,
  });
  trackNativeActivation(task);
  task
    .then(() => {
      log.info('connection.activation_finished', {
        run,
        superseded: run !== connectionOperation,
        elapsedMs: nowMs() - startedAt,
      });
    })
    .catch((error: unknown) => {
      log.error('connection.native_activation_failed', error, {
        run,
        elapsedMs: nowMs() - startedAt,
      });
    });
}

export async function loadConnection(): Promise<void> {
  const run = ++connectionOperation;
  const startedAt = nowMs();
  try {
    await cancelPairingSession();
    const next = await stateNow();
    if (run !== connectionOperation) {
      log.debug('connection.load_superseded', { run, current: connectionOperation });
      return;
    }
    log.info('connection.loaded', {
      run,
      status: next.status,
      kind: next.status === 'paired' ? next.kind : null,
      elapsedMs: nowMs() - startedAt,
    });
    if (next.status === 'paired') activateEnrollment(next.connection, run);
    const previous = connectionState.get();
    if (
      next.status === 'paired' &&
      previous.status === 'paired' &&
      next.connection.url === previous.connection.url &&
      next.connection.token === previous.connection.token
    ) {
      connectionState.set({ ...next, connection: previous.connection });
    } else connectionState.set(next);
  } catch (error) {
    if (run !== connectionOperation) return;
    log.error('connection.unreadable', error);
    connectionState.set({ status: 'unavailable', problem: rawErrorText(error) });
  }
}

function beginPairing(): PairingRun {
  const state = connectionState.get();
  if (state.status !== 'unpaired') throw new NotPairedError(state.status);
  const generation = ++connectionOperation;
  return {
    kind: state.kind,
    generation,
    isCurrent: (): boolean => generation === connectionOperation,
    publish: (connection): void => {
      connectionState.set({ status: 'paired', kind: state.kind, connection });
    },
  };
}

export const pairingHost: PairingHost = {
  begin: beginPairing,
  release: (run): void => {
    if (!run.isCurrent()) return;
    connectionOperation += 1;
  },
};

export async function forgetServer(): Promise<void> {
  const state = connectionState.get();
  if (state.status !== 'paired' && state.status !== 'removed') {
    return;
  }
  if (state.kind === 'desktop') {
    throw new OwnerCannotUnpairError();
  }
  connectionOperation += 1;
  if (state.status === 'paired') await clearNativeServerCredential(state.connection.token);
  await forgetConnection(state.kind);
  await forgetHubTrust();
  connectionState.set(unpairedState(state.kind));
  log.info('connection.forgotten', { kind: state.kind });
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
