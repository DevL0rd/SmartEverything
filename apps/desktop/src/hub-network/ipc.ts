import { ipcMain, type WebContents } from 'electron';
import { z } from 'zod';
import {
  HUB_PAIRING_INSPECTION_ID,
  HUB_PAIRING_SCOPE_PREFIX,
  NATIVE_HUB_REQUEST,
  NATIVE_HUB_RESOURCE_OPEN,
  NATIVE_HUB_ROUTE_CONFIGURATION,
  NATIVE_HUB_SOCKET_OPEN,
  NATIVE_HUB_TRUST,
  type NativeHubCapabilities,
} from '@smarteverything/domain';
import type { HubLeasePort } from '@smarteverything/hub/client-network/lease';
import { HubPolicies, HubTransportError } from '@smarteverything/hub/client-network/policy';
import { requestHub } from '@smarteverything/hub/client-network/request';
import { HubSockets } from '@smarteverything/hub/client-network/sockets';
import { Logger } from '@smarteverything/logging';
import { configureDesktopHtml } from '../html-preview/projections.js';
import { isAppOrigin } from '../origin.js';
import { DesktopRouteAuthority } from './authority.js';
import { hubCapabilities } from './capabilities.js';
import { HubDiscovery } from './discovery.js';
import { HubNetworkChanges } from './network.js';
import { DesktopPairingEnrollments } from './pairing-enrollment.js';
import { HubPairingInspections } from './pairing-inspection.js';
import { DesktopHubResources } from './resources.js';

const log = new Logger('desktop.hub-media');
const CHANNELS = [
  'desktop:hub-resource-open',
  'desktop:hub-resource-release',
  'desktop:hub-resource-download',
  'desktop:hub-authority-configure',
  'desktop:hub-authority-state',
  'desktop:hub-authority-refresh',
  'desktop:hub-authority-clear',
  'desktop:hub-configure-trust',
  'desktop:hub-clear-trust',
  'desktop:hub-request',
  'desktop:hub-discovery-start',
  'desktop:hub-discovery-stop',
  'desktop:hub-pairing-inspect',
  'desktop:hub-pairing-cancel',
  'desktop:hub-network-start',
  'desktop:hub-network-stop',
  'desktop:hub-socket-open',
  'desktop:hub-socket-send',
  'desktop:hub-socket-close',
] as const;
const SCOPE = z.string().min(1);

class HubNetworkIpc {
  #resources: DesktopHubResources | null = null;
  #closeHtml: (() => void) | undefined;
  readonly #authority: DesktopRouteAuthority | null;
  readonly #port: HubLeasePort;
  readonly #policies = new HubPolicies();
  readonly #inspections = new HubPairingInspections<WebContents>();
  readonly #enrollments = new DesktopPairingEnrollments<WebContents>();
  readonly #followed = new WeakSet<WebContents>();
  readonly #owners = new Map<WebContents, Set<string>>();
  readonly #sockets: HubSockets<WebContents>;
  readonly #discoverers = new Set<WebContents>();
  readonly #watchers = new Set<WebContents>();
  readonly #discovery = new HubDiscovery((state) => {
    this.#sendAll(this.#discoverers, 'desktop:hub-discovery', state);
  });
  readonly #network = new HubNetworkChanges((state) => {
    this.#authority?.networkChanged();
    this.#inspections.close();
    this.#enrollments.close();
    this.#discovery.stop();
    this.#sendAll(this.#watchers, 'desktop:hub-network', state);
  });
  constructor(
    readonly startUrl: string,
    routeAuthority: boolean,
  ) {
    this.#authority = routeAuthority
      ? new DesktopRouteAuthority((state): void => {
          for (const [owner, scopes] of this.#owners)
            if (scopes.has(state.scopeId)) this.#send(owner, 'desktop:hub-authority', state);
        })
      : null;
    this.#port = this.#authority ?? this.#policies;
    this.#sockets = new HubSockets<WebContents>(this.#port, (owner, state) => {
      this.#send(owner, 'desktop:hub-socket', state);
    });
  }
  get mediaOrigin(): string | undefined {
    return this.#resources?.broker.origin;
  }
  get capabilities(): NativeHubCapabilities {
    return hubCapabilities(this.#authority !== null, this.#resources !== null);
  }
  async initialize(): Promise<void> {
    if (this.#authority === null) return;
    this.#initializeHtml(this.#authority);
    const resources = new DesktopHubResources(this.#authority, this.startUrl);
    try {
      await resources.broker.start();
      this.#resources = resources;
    } catch (cause) {
      resources.broker.close();
      log.warn('resource.listener_unavailable', {
        error_name: cause instanceof Error ? cause.name : 'unknown',
      });
    }
    const network = await this.#network.start();
    if (network.state !== 'watching')
      log.warn('network.events_unavailable', { state: network.state });
  }
  #initializeHtml(authority: DesktopRouteAuthority): void {
    this.#closeHtml = configureDesktopHtml({
      authorize: (_scope, _authorization, ownerId): void => {
        const owner = [...this.#owners.keys()].find((candidate) => candidate.id === ownerId);
        if (owner === undefined || !isAppOrigin(owner.getURL(), this.startUrl))
          throw new HubTransportError('Native HTML requires its trusted app window');
      },
      lease: (scope, input) => authority.resourceLease(scope, input),
      failed: (scope, generation): void => {
        authority.failed(scope, generation);
      },
    });
  }
  register(): void {
    this.#registerAuthority();
    this.#registerTransport();
    this.#registerObservers();
    this.#registerPairing();
    this.#registerSockets();
    this.#registerResources();
  }
  #registerAuthority(): void {
    this.#handle('desktop:hub-authority-configure', (value, owner) => {
      const configuration = NATIVE_HUB_ROUTE_CONFIGURATION.parse(value);
      if (configuration.trust.scopeId.startsWith(HUB_PAIRING_SCOPE_PREFIX))
        throw new HubTransportError('Pairing namespace cannot configure paired routes');
      this.#claimScope(owner, configuration.trust.scopeId);
      return this.#requireAuthority().configure(configuration);
    });
    this.#handle('desktop:hub-authority-state', (value) =>
      this.#requireAuthority().state(SCOPE.parse(value)),
    );
    this.#handle('desktop:hub-authority-refresh', (value) =>
      this.#requireAuthority().refresh(SCOPE.parse(value)),
    );
    this.#handle('desktop:hub-authority-clear', (value, owner) => {
      this.#releaseScope(owner, SCOPE.parse(value));
    });
  }
  #registerTransport(): void {
    this.#handle('desktop:hub-configure-trust', (value, owner) => {
      const trust = NATIVE_HUB_TRUST.parse(value);
      this.#claimScope(owner, trust.scopeId);
      if (trust.scopeId.startsWith(HUB_PAIRING_SCOPE_PREFIX))
        this.#enrollments.configure(owner, trust);
      else if (this.#policies.configure(trust)) this.#sockets.clear(trust.scopeId);
    });
    this.#handle('desktop:hub-clear-trust', (value, owner) => {
      this.#releaseScope(owner, SCOPE.parse(value));
    });
    this.#handle('desktop:hub-request', (value, owner) => {
      const input = NATIVE_HUB_REQUEST.parse(value);
      if (input.scopeId.startsWith(HUB_PAIRING_SCOPE_PREFIX))
        return this.#enrollments.request(owner, input);
      return requestHub(this.#port, input);
    });
  }
  #registerObservers(): void {
    this.#handle('desktop:hub-discovery-start', (_value, owner) => {
      this.#discoverers.add(owner);
      return this.#discovery.start();
    });
    this.#handle('desktop:hub-discovery-stop', (_value, owner) => {
      this.#stopDiscovery(owner);
    });
    this.#handle('desktop:hub-network-start', (_value, owner) => {
      this.#watchers.add(owner);
      return this.#network.start();
    });
    this.#handle('desktop:hub-network-stop', (_value, owner) => {
      this.#unwatch(owner);
    });
  }
  #stopDiscovery(owner: WebContents): void {
    if (this.#discoverers.size === 1 && this.#discoverers.has(owner)) this.#discovery.stop();
    this.#discoverers.delete(owner);
  }
  #unwatch(owner: WebContents): void {
    this.#watchers.delete(owner);
    if (this.#watchers.size === 0 && this.#authority === null) this.#network.stop();
  }
  #registerPairing(): void {
    this.#handle('desktop:hub-pairing-inspect', (value, owner) => {
      if (!this.#discoverers.has(owner))
        throw new HubTransportError('Start the nearby search before inspecting a home');
      return this.#inspections.inspect(owner, value);
    });
    this.#handle('desktop:hub-pairing-cancel', (value, owner) => {
      this.#inspections.cancel(owner, HUB_PAIRING_INSPECTION_ID.parse(value));
    });
  }
  #registerSockets(): void {
    this.#handle('desktop:hub-socket-open', (value, owner) => {
      const input = NATIVE_HUB_SOCKET_OPEN.parse(value);
      this.#sockets.open(owner, input);
    });
    this.#handle('desktop:hub-socket-send', (value, owner) => {
      this.#sockets.send(owner, value);
    });
    this.#handle('desktop:hub-socket-close', (value, owner) => {
      this.#sockets.close(owner, SCOPE.parse(value));
    });
  }
  #requireResources(): DesktopHubResources {
    if (this.#resources === null)
      throw new HubTransportError('Native streamed media is unsupported');
    return this.#resources;
  }
  #registerResources(): void {
    this.#handle('desktop:hub-resource-open', (value, owner) => {
      const input = NATIVE_HUB_RESOURCE_OPEN.parse(value);
      return this.#requireResources().open(owner, input);
    });
    this.#handle('desktop:hub-resource-release', (value, owner) => {
      this.#requireResources().release(owner, value);
    });
    this.#handle('desktop:hub-resource-download', (value, owner) =>
      this.#requireResources().download(owner, value),
    );
  }
  close(): void {
    this.#closeHtml?.();
    this.#closeHtml = undefined;
    this.#inspections.close();
    this.#enrollments.close();
    this.#discovery.stop();
    this.#network.stop();
    this.#sockets.stop();
    this.#resources?.broker.close();
    this.#policies.close();
    this.#authority?.close();
    for (const channel of CHANNELS) ipcMain.removeHandler(channel);
    this.#owners.clear();
  }
  #requireAuthority(): DesktopRouteAuthority {
    if (this.#authority === null)
      throw new HubTransportError('This service has no supported Node route authority');
    return this.#authority;
  }
  #claimScope(owner: WebContents, scopeId: string): void {
    this.#owners.get(owner)?.add(scopeId);
  }
  #releaseScope(owner: WebContents, scopeId: string): void {
    this.#owners.get(owner)?.delete(scopeId);
    if ([...this.#owners.values()].some((scopes) => scopes.has(scopeId))) return;
    this.#clear(scopeId);
  }
  #clear(scopeId: string): void {
    if (scopeId.startsWith(HUB_PAIRING_SCOPE_PREFIX)) {
      this.#enrollments.clear(scopeId);
      return;
    }
    this.#sockets.clear(scopeId);
    this.#resources?.broker.clearScope(scopeId);
    this.#policies.clear(scopeId);
    this.#authority?.clear(scopeId);
  }
  #send(owner: WebContents, channel: string, state: unknown): void {
    if (!owner.isDestroyed() && isAppOrigin(owner.getURL(), this.startUrl))
      owner.send(channel, state);
  }
  #sendAll(owners: ReadonlySet<WebContents>, channel: string, state: unknown): void {
    for (const owner of owners) this.#send(owner, channel, state);
  }
  #release(owner: WebContents): void {
    this.#inspections.clearOwner(owner);
    this.#sockets.closeOwner(owner);
    this.#resources?.broker.closeOwner(owner.id);
    const scopes = this.#owners.get(owner);
    if (scopes !== undefined) for (const scope of [...scopes]) this.#releaseScope(owner, scope);
    this.#owners.delete(owner);
    this.#stopDiscovery(owner);
    this.#unwatch(owner);
  }
  #follow(owner: WebContents): void {
    if (this.#owners.has(owner)) return;
    this.#owners.set(owner, new Set());
    if (this.#followed.has(owner)) return;
    this.#followed.add(owner);
    const release = (): void => {
      this.#release(owner);
    };
    owner.once('destroyed', release);
    owner.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
      if (mainFrame && !inPlace) release();
    });
  }
  #handle(
    channel: (typeof CHANNELS)[number],
    operation: (value: unknown, sender: WebContents) => unknown,
  ): void {
    ipcMain.handle(channel, (event, value: unknown) => {
      if (
        !isAppOrigin(event.senderFrame?.url, this.startUrl) ||
        event.senderFrame !== event.sender.mainFrame
      )
        throw new HubTransportError('Hub networking requires trusted app main frame');
      this.#follow(event.sender);
      return operation(value, event.sender);
    });
  }
}

export interface HubNetworkRegistration {
  readonly capabilities: NativeHubCapabilities;
  readonly close: () => void;
}

export async function registerHubNetworkIpc(
  startUrl: string,
  routeAuthority: boolean,
  mediaReady?: (origin: string) => void,
): Promise<HubNetworkRegistration> {
  const network = new HubNetworkIpc(startUrl, routeAuthority);
  await network.initialize();
  if (network.mediaOrigin !== undefined) mediaReady?.(network.mediaOrigin);
  network.register();
  return {
    capabilities: network.capabilities,
    close: (): void => {
      network.close();
    },
  };
}
