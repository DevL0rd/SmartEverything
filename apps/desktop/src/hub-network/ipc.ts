import { configureDesktopHtml } from '../html-preview/projections.js';
import { ipcMain, type IpcMainEvent, type WebContents } from 'electron';
import { z } from 'zod';
import {
  NATIVE_HUB_REQUEST,
  NATIVE_HUB_RESOURCE_OPEN,
  NATIVE_HUB_SOCKET_OPEN,
  NATIVE_HUB_ROUTE_CONFIGURATION,
  NATIVE_HUB_TRUST,
} from '../../../../packages/domain/src/hub-native';
import { isAppOrigin } from '../origin.js';
import type { HubLeasePort } from '../../../hub/src/client-network/lease';
import { DesktopRouteAuthority } from './authority.js';
import { HubDiscovery } from './discovery.js';
import { HubNetworkChanges } from './network.js';
import { HubPolicies, HubTransportError } from './policy.js';
import { requestHub } from './request.js';
import { HubSockets } from './sockets.js';
import { DesktopHubResources } from './resources.js';
import { Logger } from '@smarteverything/logging';
import {
  HUB_PAIRING_INSPECTION_ID,
  HUB_PAIRING_SCOPE_PREFIX,
} from '../../../../packages/domain/src/hub-pairing';
import { HubPairingInspections } from './pairing-inspection.js';
import { DesktopPairingEnrollments } from './pairing-enrollment.js';
const log = new Logger('desktop.hub-media');
const CHANNELS = [
  'desktop:hub-authority-supported',
  'desktop:hub-resource-supported',
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
class HubNetworkIpc {
  #supported = false;
  #resources: DesktopHubResources | null = null;
  #closeHtml: (() => void) | undefined;
  get mediaOrigin(): string | undefined {
    return this.#resources?.broker.origin;
  }
  #authority: DesktopRouteAuthority | null;
  readonly #policies = new HubPolicies();
  readonly #inspections = new HubPairingInspections<WebContents>();
  readonly #enrollments = new DesktopPairingEnrollments<WebContents>();
  readonly #followed = new WeakSet<WebContents>();
  readonly #owners = new Map<WebContents, Set<string>>();
  readonly #sockets = new HubSockets<WebContents>(
    {
      lease: (scopeId, input, binding, generation): ReturnType<HubLeasePort['lease']> =>
        (this.#authority ?? this.#policies).lease(scopeId, input, binding, generation),
      failed: (scopeId, generation): void => {
        this.#authority?.failed(scopeId, generation);
      },
    },
    (owner, state) => {
      this.#send(owner, 'desktop:hub-socket', state);
    },
  );
  #subscriber: WebContents | undefined;
  #networkSubscriber: WebContents | undefined;
  readonly #discovery = new HubDiscovery((state) => {
    this.#inspections.reconcile();
    this.#send(this.#subscriber, 'desktop:hub-discovery', state);
  });
  readonly #network = new HubNetworkChanges((state) => {
    this.#inspections.close();
    this.#enrollments.close();
    this.#discovery.stop();
    this.#send(this.#networkSubscriber, 'desktop:hub-network', state);
  });
  constructor(
    readonly startUrl: string,
    directory?: string,
  ) {
    this.#authority =
      directory === undefined
        ? null
        : new DesktopRouteAuthority(directory, (state): void => {
            for (const [owner, scopes] of this.#owners)
              if (scopes.has(state.scopeId)) this.#send(owner, 'desktop:hub-authority', state);
          });
  }
  async initialize(): Promise<void> {
    this.#supported = (await this.#authority?.supported()) ?? false;
    if (!this.#supported) {
      this.#authority?.close();
      this.#authority = null;
    }
    if (this.#authority !== null) {
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
    }
  }
  #initializeHtml(authority: DesktopRouteAuthority): void {
    this.#closeHtml = configureDesktopHtml({
      authorize: (scope, bearer, ownerId): void => {
        const owner = [...this.#owners.keys()].find((candidate) => candidate.id === ownerId);
        if (owner === undefined || !isAppOrigin(owner.getURL(), this.startUrl))
          throw new HubTransportError('Native HTML requires its trusted app window');
        this.#ownScope(owner, scope);
        authority.authorize(scope, bearer);
      },
      lease: (scope, input, binding, generation): ReturnType<HubLeasePort['lease']> =>
        authority.resourceLease(scope, input, binding, generation),
      failed: (scope, generation): void => {
        authority.failed(scope, generation);
      },
    });
  }
  readonly #support = (event: IpcMainEvent): void => {
    const response = event;
    response.returnValue =
      isAppOrigin(event.senderFrame?.url, this.startUrl) &&
      event.senderFrame === event.sender.mainFrame &&
      this.#supported;
  };
  register(): void {
    this.#registerAuthority();
    this.#registerTransport();
    this.#registerObservers();
    this.#registerPairing();
    this.#registerSockets();
    this.#registerResources();
  }
  #registerAuthority(): void {
    ipcMain.on('desktop:hub-authority-supported', this.#support);
    this.#handle('desktop:hub-authority-configure', (value, owner) => {
      const configuration = NATIVE_HUB_ROUTE_CONFIGURATION.parse(value);
      if (configuration.trust.scopeId.startsWith(HUB_PAIRING_SCOPE_PREFIX))
        throw new HubTransportError('Pairing namespace cannot configure paired routes');
      this.#claimScope(owner, configuration.trust.scopeId);
      return this.#requireAuthority().configure(configuration);
    });
    this.#handle('desktop:hub-authority-state', (value, owner) => {
      const scope = z.string().min(1).max(200).parse(value);
      this.#ownScope(owner, scope);
      return this.#requireAuthority().state(scope);
    });
    this.#handle('desktop:hub-authority-refresh', (value, owner) => {
      const scope = z.string().min(1).max(200).parse(value);
      this.#ownScope(owner, scope);
      return this.#requireAuthority().refresh(scope);
    });
    this.#handle('desktop:hub-authority-clear', (value, owner) => {
      const scope = z.string().min(1).max(200).parse(value);
      this.#releaseScope(owner, scope);
    });
  }
  #registerTransport(): void {
    this.#handle('desktop:hub-configure-trust', (value, owner) => {
      const trust = NATIVE_HUB_TRUST.parse(value);
      if (trust.scopeId.startsWith(HUB_PAIRING_SCOPE_PREFIX)) {
        this.#claimScope(owner, trust.scopeId);
        this.#enrollments.configure(owner, trust);
        return;
      }
      if (this.#authority !== null)
        throw new HubTransportError(
          'Node authority trust is read-only; enroll a paired client binding',
        );
      this.#claimScope(owner, trust.scopeId);
      if (this.#policies.configure(trust)) this.#sockets.clear(trust.scopeId);
    });
    this.#handle('desktop:hub-clear-trust', (value, owner) => {
      const scope = z.string().min(1).max(200).parse(value);
      this.#releaseScope(owner, scope);
    });
    this.#handle('desktop:hub-request', (value, owner) => {
      const input = NATIVE_HUB_REQUEST.parse(value);
      this.#ownScope(owner, input.scopeId);
      if (input.scopeId.startsWith(HUB_PAIRING_SCOPE_PREFIX))
        return this.#enrollments.request(owner, input);
      if (this.#authority !== null) {
        const headers = Object.entries(input.headers).filter(
          ([key]) => key.toLowerCase() === 'authorization',
        );
        if (headers.length !== 1)
          throw new HubTransportError('Client requests require one authorization header');
        this.#authority.authorize(input.scopeId, headers[0]?.[1]);
      }
      return requestHub(this.#authority ?? this.#policies, input);
    });
  }
  #registerObservers(): void {
    this.#handle('desktop:hub-discovery-start', (_value, owner) => {
      if (this.#subscriber !== undefined && this.#subscriber !== owner)
        throw new HubTransportError('Discovery belongs to another window');
      this.#subscriber = owner;
      return this.#discovery.start();
    });
    this.#handle('desktop:hub-discovery-stop', (_value, owner) => {
      if (this.#subscriber === undefined) return;
      if (this.#subscriber !== owner)
        throw new HubTransportError('Discovery belongs to another window');
      this.#discovery.stop();
      this.#subscriber = undefined;
    });
    this.#handle('desktop:hub-network-start', (_value, owner) => {
      if (this.#networkSubscriber !== undefined && this.#networkSubscriber !== owner)
        throw new HubTransportError('Network observation belongs to another window');
      this.#networkSubscriber = owner;
      return this.#network.start();
    });
    this.#handle('desktop:hub-network-stop', (_value, owner) => {
      if (this.#networkSubscriber === undefined) return;
      if (this.#networkSubscriber !== owner)
        throw new HubTransportError('Network observation belongs to another window');
      this.#network.stop();
      this.#networkSubscriber = undefined;
    });
  }
  #registerPairing(): void {
    this.#handle('desktop:hub-pairing-inspect', (value, owner) => {
      if (this.#subscriber !== owner)
        throw new HubTransportError('Discovery belongs to another window');
      return this.#inspections.inspect(owner, value, (input) => this.#discovery.selected(input));
    });
    this.#handle('desktop:hub-pairing-cancel', (value, owner) => {
      this.#inspections.cancel(owner, HUB_PAIRING_INSPECTION_ID.parse(value));
    });
  }
  #registerSockets(): void {
    this.#handle('desktop:hub-socket-open', (value, owner) => {
      const input = NATIVE_HUB_SOCKET_OPEN.parse(value);
      this.#ownScope(owner, input.scopeId);
      this.#authority?.authorizeSocket(input.scopeId, input.protocols);
      this.#sockets.open(owner, input);
    });
    this.#handle('desktop:hub-socket-send', (value, owner) => {
      this.#sockets.send(owner, value);
    });
    this.#handle('desktop:hub-socket-close', (value, owner) => {
      this.#sockets.close(owner, z.string().min(1).max(100).parse(value));
    });
  }
  readonly #resourceSupport = (event: IpcMainEvent): void => {
    const response = event;
    response.returnValue =
      isAppOrigin(event.senderFrame?.url, this.startUrl) &&
      event.senderFrame === event.sender.mainFrame &&
      this.#resources !== null;
  };
  #requireResources(): DesktopHubResources {
    if (this.#resources === null)
      throw new HubTransportError('Native streamed media is unsupported');
    return this.#resources;
  }
  #registerResources(): void {
    ipcMain.on('desktop:hub-resource-supported', this.#resourceSupport);
    this.#handle('desktop:hub-resource-open', (value, owner) => {
      const input = NATIVE_HUB_RESOURCE_OPEN.parse(value);
      this.#ownScope(owner, input.scopeId);
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
    ipcMain.removeListener('desktop:hub-authority-supported', this.#support);
    ipcMain.removeListener('desktop:hub-resource-supported', this.#resourceSupport);
    this.#owners.clear();
  }
  #requireAuthority(): DesktopRouteAuthority {
    if (this.#authority === null)
      throw new HubTransportError('This service has no supported Node route authority');
    return this.#authority;
  }
  #claimScope(owner: WebContents, scopeId: string): void {
    for (const [other, scopes] of this.#owners)
      if (other !== owner && scopes.has(scopeId))
        throw new HubTransportError('Hub scope belongs to another window');
    this.#owners.get(owner)?.add(scopeId);
  }
  #ownScope(owner: WebContents, scopeId: string): void {
    if (this.#owners.get(owner)?.has(scopeId) !== true)
      throw new HubTransportError('Hub scope belongs to another window');
  }
  #releaseScope(owner: WebContents, scopeId: string): void {
    if (![...this.#owners.values()].some((scopes) => scopes.has(scopeId))) return;
    this.#ownScope(owner, scopeId);
    this.#clear(scopeId);
  }
  #clear(scopeId: string): void {
    if (scopeId.startsWith(HUB_PAIRING_SCOPE_PREFIX)) {
      this.#enrollments.clear(scopeId);
      for (const scopes of this.#owners.values()) scopes.delete(scopeId);
      return;
    }
    this.#sockets.clear(scopeId);
    this.#resources?.broker.clearScope(scopeId);
    this.#policies.clear(scopeId);
    this.#authority?.clear(scopeId);
    for (const scopes of this.#owners.values()) scopes.delete(scopeId);
  }
  #send(owner: WebContents | undefined, channel: string, state: unknown): void {
    if (owner !== undefined && !owner.isDestroyed() && isAppOrigin(owner.getURL(), this.startUrl))
      owner.send(channel, state);
  }
  #follow(owner: WebContents): void {
    if (this.#owners.has(owner)) return;
    this.#owners.set(owner, new Set());
    if (this.#followed.has(owner)) return;
    this.#followed.add(owner);
    const clear = (): void => {
      this.#inspections.clearOwner(owner);
      this.#sockets.closeOwner(owner);
      this.#resources?.broker.closeOwner(owner.id);
      const scopes = this.#owners.get(owner);
      if (scopes !== undefined) for (const scope of [...scopes]) this.#clear(scope);
      this.#owners.delete(owner);
      if (this.#subscriber === owner) {
        this.#discovery.stop();
        this.#subscriber = undefined;
      }
      if (this.#networkSubscriber === owner) {
        this.#network.stop();
        this.#networkSubscriber = undefined;
      }
    };
    owner.once('destroyed', clear);
    owner.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => {
      if (mainFrame) clear();
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
export async function registerHubNetworkIpc(
  startUrl: string,
  directory?: string,
  mediaReady?: (origin: string) => void,
): Promise<() => void> {
  const network = new HubNetworkIpc(startUrl, directory);
  await network.initialize();
  if (network.mediaOrigin !== undefined) mediaReady?.(network.mediaOrigin);
  network.register();
  return () => {
    network.close();
  };
}
