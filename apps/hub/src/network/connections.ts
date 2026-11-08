import type { AddressInfo } from 'node:net';
import {
  type HubConnectionMetadata,
  type HubDiscoveryStatus,
  type HubEndpoint,
  type HubPublicIdentity,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { lanEndpoints } from './addresses';
import type { HubTlsIdentity } from './identity';

const log = new Logger('hub.network');

export class HubConnections {
  private listener: AddressInfo | null = null;
  private discovery: HubDiscoveryStatus = { state: 'disabled', detail: 'Discovery is disabled.' };

  constructor(
    readonly tls: HubTlsIdentity,
    private readonly store: Store,
  ) {}

  listening(lan: AddressInfo | null): void {
    this.listener = lan;
    log.info('listeners.changed', {
      lanPort: lan?.port ?? null,
      lanFamily: lan?.family ?? null,
      lanBound: lan !== null,
      lanEndpoints: lan === null ? 0 : lanEndpoints(lan).length,
    });
  }

  discoveryChanged(status: HubDiscoveryStatus): void {
    if (status.state !== this.discovery.state) {
      log.info('discovery.changed', { from: this.discovery.state, to: status.state });
    }
    this.discovery = status;
  }

  publicIdentity(): HubPublicIdentity {
    return { service: 'smarteverything', identity: this.tls.identity };
  }

  metadata(): HubConnectionMetadata {
    const settings = this.store.settings.read();
    const remoteAvailable =
      settings.public_url !== null && settings.public_url_verified_at !== null;
    const endpoints: HubEndpoint[] = [];
    if (this.listener !== null) {
      const lan = lanEndpoints(this.listener);
      if (lan.length > 0)
        endpoints.push(
          {
            kind: 'lan',
            url: `https://${this.tls.identity.tls.serverName}:${String(this.listener.port)}`,
          },
          ...lan,
        );
    }
    if (remoteAvailable && settings.public_url !== null) {
      endpoints.push({ kind: 'remote', url: settings.public_url });
    }
    return { identity: this.tls.identity, endpoints, remoteAvailable, discovery: this.discovery };
  }
}
