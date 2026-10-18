import type { AddressInfo } from 'node:net';
import type { HubDiscoveryStatus, HubIdentity } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { HUB_SERVICE_TYPE, openMdns, type Mdns, type OpenMdns } from './mdns';
import { messageOf } from '@smarteverything/logging';

export interface AdvertisementOptions {
  readonly identity: HubIdentity;
  readonly listener: AddressInfo;
  readonly log: Logger;
  readonly changed: (status: HubDiscoveryStatus) => void;
  readonly networkChanged?: () => void;
  readonly mdns?: OpenMdns;
}

function publish(mdns: Mdns, options: AdvertisementOptions): void {
  const { identity, listener } = options;
  options.log.info('discovery.publishing', {
    port: listener.port,
    family: listener.family,
    ipv6: listener.address === '::' || listener.family === 'IPv6',
  });
  options.changed({ state: 'starting', detail: 'Waiting for DNS-SD registration.' });
  const service = mdns.bonjour.publish({
    name: `${identity.name.slice(0, 48)} ${identity.id.slice(0, 8)}`,
    type: HUB_SERVICE_TYPE,
    port: listener.port,
    host: identity.tls.serverName,
    probe: false,
    disableIPv6: listener.address !== '::' && listener.family !== 'IPv6',
    txt: {
      id: identity.id,
      protocol: '1',
      tls: '1',
      host: identity.tls.serverName,
    },
  });
  const startedAt = performance.now();
  service.on('up', () => {
    options.log.info('discovery.advertising', {
      afterMs: Math.round(performance.now() - startedAt),
    });
    options.changed({
      state: 'advertising',
      detail: 'Encrypted LAN listener advertised over mDNS.',
    });
  });
}

export function advertiseHub(options: AdvertisementOptions): () => Promise<void> {
  const mdns = (options.mdns ?? openMdns)((cause) => {
    options.changed({
      state: 'unavailable',
      detail: 'DNS-SD unavailable; use a trusted invitation or QR.',
    });
    options.log.warn('discovery.unavailable', {
      reason: messageOf(cause),
    });
  });
  publish(mdns, options);
  const unwatch = mdns.onNetworkChange(() => {
    options.log.info('discovery.network_changed', { action: 'republish' });
    mdns.bonjour.unpublishAll();
    publish(mdns, options);
    options.networkChanged?.();
  });
  return async () => {
    options.log.info('discovery.stopping');
    unwatch();
    await mdns.close();
    options.changed({ state: 'disabled', detail: 'DNS-SD advertisement stopped.' });
  };
}
