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
  type ServerConnection,
  type StoredKind,
} from './storage';
import { clearServerCapabilities } from './server-capabilities';
import { rawErrorText } from '../../format/errors';
import type { PairingTarget } from '../pairing-input';
import { ValueStore } from '../../design/external-store';
import { routeFor, stopHubRoute } from './active-route';
import { StaleHubRouteError } from './route-policy';
import {
  activateNativeServerEnrollment,
  clearNativeServerCredential,
  supersedeNativeServerActivation,
} from '../../../modules/health-connect/src/hub-network';
import { forgetHubTrust } from './trust-storage';
import {
  PairingBusyError,
  type EnrollmentDestination,
  type PairingEnrollment,
} from './pairing-enrollment';
import {
  preparePairingSession,
  submitPairingSession,
  hasPairingSession,
  cancelPairingSession,
} from './pairing-session';
export { recoverPairingSession as recoverPairing } from './pairing-session';
import { destinationsFromQr } from './pairing-qr';

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
  supersedeNativeServerActivation(connectionOperation);
  stopHubRoute();
  void clearNativeServerCredential(connection.token).catch((error: unknown) => {
    log.warn('connection.native_credential_clear_failed', {
      failure: error instanceof Error ? error.name : 'NativeFailure',
    });
  });
  void forgetHubTrust().catch((error: unknown) => {
    log.warn('connection.trust_cache_clear_failed', {
      failure: error instanceof Error ? error.name : 'StorageFailure',
    });
  });
  clearServerCapabilities(connection.url);
  log.warn('connection.token_refused', { kind: state.kind });
  if (state.kind === 'desktop') {
    void loadConnection();
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
  const plan = connectionPlanOf({
    form,
    localServer: form === 'desktop' && !preferRemote ? await localServerHealth() : null,
    preferRemote,
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
  const run = ++connectionOperation;
  try {
    supersedeNativeServerActivation(run);
    await cancelPairingSession();
    const next = await stateNow();
    if (run !== connectionOperation) return;
    if (next.status === 'paired')
      await activateNativeServerEnrollment(next.connection.url, next.connection.token, {
        order: run,
        isCurrent: (): boolean => run === connectionOperation,
      });
    if (run !== connectionOperation) return;
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

export interface PairRequest {
  readonly target: PairingTarget;
  readonly name: string;
}

export async function preparePairing(
  destination: EnrollmentDestination,
  handoff: () => Promise<void> = (): Promise<void> => Promise.resolve(),
  owner = Symbol(),
): Promise<PairingEnrollment> {
  if (hasPairingSession()) throw new PairingBusyError();
  const state = connectionState.get();
  if (state.status !== 'unpaired') throw new NotPairedError(state.status);
  const generation = ++connectionOperation;
  supersedeNativeServerActivation(generation);
  return preparePairingSession(destination, {
    kind: state.kind,
    generation,
    handoff,
    owner,
    isCurrent: (): boolean => generation === connectionOperation,
    publish: (result): void => {
      connectionState.set({ status: 'paired', kind: state.kind, connection: result.connection });
    },
  });
}
export function submitPairing(
  enrollment: PairingEnrollment,
  code: string,
  name: string,
): Promise<ClientRow> {
  return submitPairingSession(enrollment, code, name);
}
export async function cancelPairing(owner?: symbol): Promise<void> {
  if (!hasPairingSession(owner)) return;
  connectionOperation += 1;
  supersedeNativeServerActivation(connectionOperation);
  await cancelPairingSession(owner);
}
function canTryPairingEndpoint(
  error: unknown,
  generation: number,
  isCurrent: () => boolean,
): boolean {
  return !(error instanceof PairingBusyError) && generation === connectionOperation && isCurrent();
}
export async function prepareQrPairing(
  target: PairingTarget,
  handoff: () => Promise<void> = (): Promise<void> => Promise.resolve(),
  owner = Symbol(),
  isCurrent: () => boolean = (): boolean => true,
): Promise<PairingEnrollment> {
  let failure: unknown = new PairingBusyError();
  for (const destination of destinationsFromQr(target)) {
    if (!isCurrent()) throw new StaleHubRouteError('GET');
    const generation = connectionOperation + 1;
    try {
      const enrollment = await preparePairing(destination, handoff, owner);
      if (!isCurrent()) {
        await cancelPairing(owner);
        throw new StaleHubRouteError('GET');
      }
      return enrollment;
    } catch (error) {
      if (!canTryPairingEndpoint(error, generation, isCurrent)) throw error;
      failure = error;
      log.warn('connection.pairing_endpoint_unavailable', {
        kind: destination.endpoint.kind,
        failure: error instanceof Error ? error.name : 'NativeFailure',
      });
    }
  }
  throw failure;
}
export async function pairWith(request: PairRequest): Promise<ClientRow> {
  const enrollment = await prepareQrPairing(request.target);
  return submitPairing(enrollment, request.target.code, request.name);
}

export async function forgetServer(): Promise<void> {
  const state = connectionState.get();
  if (state.status !== 'paired' && state.status !== 'removed') {
    return;
  }
  if (state.kind === 'desktop') {
    throw new OwnerCannotUnpairError();
  }
  connectionOperation += 1;
  supersedeNativeServerActivation(connectionOperation);
  clearServerCapabilities(state.status === 'paired' ? state.connection.url : state.url);
  if (state.status === 'paired') await clearNativeServerCredential(state.connection.token);
  await forgetConnection(state.kind);
  await forgetHubTrust();
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
