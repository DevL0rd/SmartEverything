import { NativeModule, requireOptionalNativeModule } from 'expo';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { z } from 'zod';
import {
  HUB_PAIRING_INSPECTION,
  HUB_PAIRING_INSPECTION_ID,
  HUB_PAIRING_OBSERVATION,
  NATIVE_HUB_DISCOVERY,
  NATIVE_HUB_NETWORK_CHANGE,
  NATIVE_HUB_RESOURCE_OPEN,
  NATIVE_HUB_RESOURCE,
  NATIVE_HUB_RESOURCE_ID,
  NATIVE_HUB_RESOURCE_DOWNLOAD,
  NATIVE_HUB_RESOURCE_DOWNLOAD_RESULT,
  NATIVE_HUB_ROUTE_CONFIGURATION,
  NATIVE_HUB_ROUTE_SNAPSHOT,
  NATIVE_HUB_TRUST,
  type NativeHubCapabilities,
  type NativeHubDiscovery,
  type NativeHubNetwork,
  type NativeHubRouteAuthority,
  type NativeHubTrust,
} from '@smarteverything/domain';
import { startNativeLogBridge } from './native-log';
import { countedListener, failureOf, log, routeSummary, timed } from './hub-network-log';
interface HubNetworkEvents {
  readonly onDiscovery: (payload: unknown) => void;
  readonly onNetwork: (payload: unknown) => void;
  readonly onRoute: (payload: unknown) => void;
  readonly [event: string]: (payload: unknown) => void;
}
declare class HubNetworkNative extends NativeModule<HubNetworkEvents> {
  inspectCandidate(json: string): Promise<unknown>;
  cancelInspection(requestId: string): Promise<void>;
  resourcesReady(): boolean;
  openResource(json: string): Promise<unknown>;
  releaseResource(id: string): Promise<void>;
  downloadResource(json: string): Promise<unknown>;
  activateServerEnrollment(canonical: string, principal: string): Promise<unknown>;
  captureServerEnrollment(canonical: string, principal: string): Promise<unknown>;
  configureRoutes(json: string, enrollment: string): Promise<unknown>;
  clearServerCredential(principal: string): Promise<void>;
  clearRoutes(scopeId: string): Promise<void>;
  refreshRoutes(scopeId: string): Promise<unknown>;
  routeState(scopeId: string): Promise<unknown>;
  configureTrust(json: string): Promise<void>;
  clearTrust(scopeId: string): Promise<void>;
  startDiscovery(): Promise<unknown>;
  stopDiscovery(): Promise<void>;
  startNetwork(): Promise<unknown>;
  stopNetwork(): Promise<void>;
}
const native = requireOptionalNativeModule<HubNetworkNative>('HubNetwork');
startNativeLogBridge();
const hasNative = native !== null;
function resourcesReady(): boolean {
  return native?.resourcesReady() === true;
}
export const nativeHubCapabilities: NativeHubCapabilities = {
  http: hasNative,
  websocket: hasNative,
  media: false,
  pairingInspection: hasNative,
  routeAuthority: hasNative,
  background: hasNative,
  get image(): boolean {
    return resourcesReady();
  },
  get httpMedia(): boolean {
    return resourcesReady();
  },
  mse: false,
  html: false,
  get download(): boolean {
    return resourcesReady();
  },
};
class HubNativeUnavailableError extends Error {
  override readonly name = 'HubNativeUnavailableError';
  constructor() {
    super('This app build cannot use pinned local hub transport; use a verified remote endpoint.');
  }
}
function moduleForHub(): HubNetworkNative {
  if (native === null) throw new HubNativeUnavailableError();
  return native;
}
export async function configureNativeHubTrust(trust: NativeHubTrust): Promise<void> {
  await timed('trust.configure', { scopeId: trust.scopeId.slice(0, 8) }, async () => {
    await moduleForHub().configureTrust(JSON.stringify(NATIVE_HUB_TRUST.parse(trust)));
  });
}
const SERVER_ENROLLMENT = z.strictObject({
  canonicalOrigin: z.url(),
  principalId: z.string().regex(/^[0-9a-f]{64}$/),
  generation: z.int().nonnegative(),
});
function enrollmentText(value: unknown): string {
  const text = z.string().parse(value);
  const input: unknown = JSON.parse(text);
  return JSON.stringify(SERVER_ENROLLMENT.parse(input));
}
const principals = new Map<string, Promise<string>>();
function serverPrincipal(token: string): Promise<string> {
  let principal = principals.get(token);
  if (principal === undefined) {
    principal = digestStringAsync(CryptoDigestAlgorithm.SHA256, token);
    principals.set(token, principal);
    principal.catch((error: unknown) => {
      principals.delete(token);
      log.warn('principal.digest_failed', failureOf(error));
    });
  } else log.trace('principal.cache_hit', { cached: principals.size });
  return principal;
}
let enrollmentOrder: Promise<void> = Promise.resolve();
function inEnrollmentOrder(step: () => Promise<void>): Promise<void> {
  const queuedAt = Date.now();
  const run = enrollmentOrder.then(() => {
    const waitedMs = Date.now() - queuedAt;
    if (waitedMs > 50) log.debug('enrollment.queue_waited', { waitedMs });
    return step();
  });
  // eslint-disable-next-line local/no-swallowed-errors -- the caller receives the same failure from run
  enrollmentOrder = run.catch(() => undefined);
  return run;
}
export interface NativeServerActivationIntent {
  readonly isCurrent: () => boolean;
}
export function activateNativeServerEnrollment(
  url: string,
  token: string,
  intent: NativeServerActivationIntent,
): Promise<void> {
  if (native === null) {
    log.debug('enrollment.activation_skipped', { reason: 'no_native_module' });
    return Promise.resolve();
  }
  return inEnrollmentOrder(async () => {
    if (!intent.isCurrent()) {
      log.debug('enrollment.activation_skipped', { reason: 'superseded_before_start' });
      return;
    }
    const principal = await serverPrincipal(token);
    if (!intent.isCurrent()) {
      log.debug('enrollment.activation_skipped', { reason: 'superseded_after_digest' });
      return;
    }
    await timed('enrollment.activation', { principal: principal.slice(0, 8) }, async () => {
      enrollmentText(await moduleForHub().activateServerEnrollment(new URL(url).origin, principal));
    });
  });
}
export async function withNativeEnrollment<T>(
  url: string,
  token: string,
  call: (enrollment: string) => Promise<T>,
): Promise<T> {
  const principal = await serverPrincipal(token);
  const ticket = await timed('enrollment.capture', { principal: principal.slice(0, 8) }, () =>
    moduleForHub().captureServerEnrollment(new URL(url).origin, principal),
  );
  return call(enrollmentText(ticket));
}
export function clearNativeServerCredential(token: string): Promise<void> {
  if (native === null) return Promise.resolve();
  return inEnrollmentOrder(async () => {
    const principal = await serverPrincipal(token);
    await timed('enrollment.clear', { principal: principal.slice(0, 8) }, () =>
      moduleForHub().clearServerCredential(principal),
    );
  });
}
export async function clearNativeHubTrust(scopeId: string): Promise<void> {
  if (native !== null)
    await timed('trust.clear', { scopeId: scopeId.slice(0, 8) }, () => native.clearTrust(scopeId));
}
export async function startNativeHubDiscovery(): Promise<NativeHubDiscovery> {
  if (native === null)
    return {
      generation: 0,
      state: 'unsupported',
      detail: 'Local discovery requires a supported Android or Linux desktop build.',
      candidates: [],
    };
  return timed(
    'discovery.start',
    {},
    async () => NATIVE_HUB_DISCOVERY.parse(await native.startDiscovery()),
    (state) => ({ state: state.state, candidates: state.candidates.length }),
  );
}
export async function stopNativeHubDiscovery(): Promise<void> {
  if (native !== null) await timed('discovery.stop', {}, () => native.stopDiscovery());
}
function subscribe(event: keyof HubNetworkEvents, listener: (value: unknown) => void): () => void {
  if (native === null) return () => undefined;
  const subscription = native.addListener(event, listener);
  return () => {
    subscription.remove();
  };
}
export function subscribeNativeHubDiscovery(
  listener: (state: NativeHubDiscovery) => void,
): () => void {
  return subscribe(
    'onDiscovery',
    countedListener(
      'discovery.event',
      (value) => {
        const state = NATIVE_HUB_DISCOVERY.safeParse(value);
        return state.success
          ? { state: state.data.state, candidates: state.data.candidates.length }
          : { unreadable: true };
      },
      (value) => {
        listener(NATIVE_HUB_DISCOVERY.parse(value));
      },
    ),
  );
}
const routeAuthority: NativeHubRouteAuthority = {
  configure: async (configuration) => {
    const binding = configuration.bindings[0];
    if (binding === undefined) throw new HubNativeUnavailableError();
    const facts = { scopeId: binding.scopeId.slice(0, 8) };
    const enrollment = enrollmentText(
      await timed('routes.capture', facts, () =>
        moduleForHub().captureServerEnrollment(configuration.canonicalOrigin, binding.principalId),
      ),
    );
    return timed(
      'routes.configure',
      facts,
      async () =>
        NATIVE_HUB_ROUTE_SNAPSHOT.parse(
          await moduleForHub().configureRoutes(
            JSON.stringify(NATIVE_HUB_ROUTE_CONFIGURATION.parse(configuration)),
            enrollment,
          ),
        ),
      routeSummary,
    );
  },
  clear: async (scopeId) => {
    await timed('routes.clear', { scopeId: scopeId.slice(0, 8) }, () =>
      moduleForHub().clearRoutes(scopeId),
    );
  },
  refresh: async (scopeId) =>
    timed(
      'routes.refresh',
      { scopeId: scopeId.slice(0, 8) },
      async () => NATIVE_HUB_ROUTE_SNAPSHOT.parse(await moduleForHub().refreshRoutes(scopeId)),
      routeSummary,
    ),
  state: async (scopeId) =>
    timed(
      'routes.state',
      { scopeId: scopeId.slice(0, 8) },
      async () => NATIVE_HUB_ROUTE_SNAPSHOT.parse(await moduleForHub().routeState(scopeId)),
      routeSummary,
    ),
  subscribe: (listener) =>
    subscribe(
      'onRoute',
      countedListener(
        'routes.event',
        (value) => {
          const state = NATIVE_HUB_ROUTE_SNAPSHOT.safeParse(value);
          return state.success ? routeSummary(state.data) : { unreadable: true };
        },
        (value) => {
          listener(NATIVE_HUB_ROUTE_SNAPSHOT.parse(value));
        },
      ),
    ),
};
export const nativeHubNetwork: NativeHubNetwork = {
  capabilities: nativeHubCapabilities,
  ...(hasNative
    ? {
        inspectCandidate: async (request) =>
          timed('inspection.candidate', { requestId: request.requestId.slice(0, 8) }, async () =>
            HUB_PAIRING_OBSERVATION.parse(
              await moduleForHub().inspectCandidate(
                JSON.stringify(HUB_PAIRING_INSPECTION.parse(request)),
              ),
            ),
          ),
        cancelInspection: async (requestId) =>
          timed('inspection.cancel', { requestId: requestId.slice(0, 8) }, () =>
            moduleForHub().cancelInspection(HUB_PAIRING_INSPECTION_ID.parse(requestId)),
          ),
      }
    : {}),
  ...(hasNative ? { routeAuthority } : {}),
  ...(hasNative
    ? {
        openResource: async (request) =>
          NATIVE_HUB_RESOURCE.parse(
            await moduleForHub().openResource(
              JSON.stringify(NATIVE_HUB_RESOURCE_OPEN.parse(request)),
            ),
          ),
        releaseResource: async (id) =>
          moduleForHub().releaseResource(NATIVE_HUB_RESOURCE_ID.parse(id)),
        downloadResource: async (request) =>
          NATIVE_HUB_RESOURCE_DOWNLOAD_RESULT.parse(
            await moduleForHub().downloadResource(
              JSON.stringify(NATIVE_HUB_RESOURCE_DOWNLOAD.parse(request)),
            ),
          ),
      }
    : {}),
  configureTrust: configureNativeHubTrust,
  clearTrust: clearNativeHubTrust,
  startDiscovery: startNativeHubDiscovery,
  stopDiscovery: stopNativeHubDiscovery,
  subscribeDiscovery: subscribeNativeHubDiscovery,
  startNetwork: async () =>
    native === null
      ? {
          generation: 0,
          state: 'unsupported',
          detail: 'Native network events are unavailable in this build.',
        }
      : timed('network.start', {}, async () =>
          NATIVE_HUB_NETWORK_CHANGE.parse(await native.startNetwork()),
        ),
  stopNetwork: async () => {
    if (native !== null) await timed('network.stop', {}, () => native.stopNetwork());
  },
  subscribeNetwork: (listener) =>
    subscribe(
      'onNetwork',
      countedListener(
        'network.event',
        (value) => {
          const change = NATIVE_HUB_NETWORK_CHANGE.safeParse(value);
          return change.success
            ? { state: change.data.state, generation: change.data.generation }
            : { unreadable: true };
        },
        (value) => {
          listener(NATIVE_HUB_NETWORK_CHANGE.parse(value));
        },
      ),
    ),
};
