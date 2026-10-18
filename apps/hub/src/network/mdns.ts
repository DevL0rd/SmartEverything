import { EventEmitter } from 'node:events';
import { isIP, isIPv4 } from 'node:net';
import Bonjour from 'bonjour-service';
import { z } from 'zod';
import { appendTo, HUB_DISCOVERY_SERVICE } from '@smarteverything/domain';

const RESPONSE = z.object({
  answers: z.array(
    z.object({ name: z.string(), type: z.string(), ttl: z.number(), data: z.unknown() }),
  ),
  additionals: z.array(
    z.object({ name: z.string(), type: z.string(), ttl: z.number(), data: z.unknown() }),
  ),
});
const SENDER = z.object({ address: z.string() });
const ADDRESS = z.string();
const TXT = z.record(z.string(), z.unknown());
const INTERNALS = z.object({ server: z.object({ mdns: z.instanceof(EventEmitter) }) });
export const HUB_SERVICE_TYPE = HUB_DISCOVERY_SERVICE.split('.')[0]?.slice(1) ?? '';
const QUERY_REPEAT_MS: readonly number[] = [1000, 3000];

export interface AddressRecord {
  readonly host: string;
  readonly addresses: readonly string[];
  readonly from: string;
}

export interface Mdns {
  readonly bonjour: Bonjour;
  readonly onNetworkChange: (listener: () => void) => () => void;
  readonly onAddressRecords: (listener: (record: AddressRecord) => void) => () => void;
  readonly close: () => Promise<void>;
}

export type OpenMdns = (failed: (cause: unknown) => void) => Mdns;

export interface FoundService {
  readonly fqdn: string;
  readonly name: string;
  readonly host: string;
  readonly port: number;
  readonly address: string;
  readonly txt: ReadonlyMap<string, string>;
}

export interface ServiceHandlers {
  readonly found: (service: FoundService) => void;
  readonly lost?: (fqdn: string) => void;
}

export interface ServiceWatch {
  readonly rediscover: () => void;
  readonly stop: () => void;
}

export function mdnsEmitter(bonjour: Bonjour): EventEmitter {
  return INTERNALS.parse(bonjour).server.mdns;
}

function listen(
  emitter: EventEmitter,
  event: string,
  listener: (...args: unknown[]) => void,
): () => void {
  emitter.on(event, listener);
  return () => {
    emitter.off(event, listener);
  };
}

export function mdnsFor(bonjour: Bonjour, failed: (cause: unknown) => void): Mdns {
  const emitter = mdnsEmitter(bonjour);
  let ready = false;
  emitter.once('ready', () => {
    ready = true;
  });
  emitter.on('error', failed);
  return {
    bonjour,
    onNetworkChange: (listener) =>
      listen(emitter, 'networkInterface', () => {
        if (ready) listener();
      }),
    onAddressRecords: (listener) =>
      listen(emitter, 'response', (packet, sender) => {
        for (const record of addressRecords(packet, sender)) listener(record);
      }),
    close: () =>
      new Promise<void>((resolve) => {
        emitter.off('error', failed);
        bonjour.unpublishAll(() => {
          bonjour.destroy(() => {
            resolve();
          });
        });
      }),
  };
}

export const openMdns: OpenMdns = (failed) => mdnsFor(new Bonjour({}, failed), failed);

function addressRecords(packet: unknown, sender: unknown): readonly AddressRecord[] {
  const response = RESPONSE.safeParse(packet);
  const from = SENDER.safeParse(sender);
  if (!response.success || !from.success) return [];
  const hosts = new Map<string, string[]>();
  for (const record of [...response.data.answers, ...response.data.additionals]) {
    const address = ADDRESS.safeParse(record.data);
    if ((record.type !== 'A' && record.type !== 'AAAA') || record.ttl === 0 || !address.success)
      continue;
    appendTo(hosts, record.name.toLowerCase(), address.data);
  }
  return [...hosts].map(([host, addresses]) => ({ host, addresses, from: from.data.address }));
}

function usable(address: string): boolean {
  const lower = address.toLowerCase();
  return (
    isIP(address) > 0 &&
    !address.startsWith('169.254.') &&
    !address.startsWith('127.') &&
    lower !== '::1' &&
    !lower.startsWith('fe80:')
  );
}

function pickAddress(addresses: readonly string[], from?: string): string | null {
  const candidates = addresses.filter(usable);
  if (from !== undefined && candidates.includes(from)) return from;
  return candidates.find((address) => isIPv4(address)) ?? candidates[0] ?? null;
}

class AddressBook {
  private readonly known = new Set<string>();
  private current: string | null = null;

  consider(addresses: readonly string[], from: string | undefined): string | null {
    const heard = addresses.filter(usable);
    const fresh = heard.filter((address) => !this.known.has(address));
    for (const address of heard) this.known.add(address);
    if (this.current === null) this.current = pickAddress(heard, from);
    else if (from !== undefined && fresh.includes(from)) this.current = from;
    return this.current;
  }
}

function textOf(value: unknown): ReadonlyMap<string, string> {
  const entries = TXT.safeParse(value);
  return new Map(
    Object.entries(entries.success ? entries.data : {}).flatMap(([key, entry]) =>
      typeof entry === 'string' ? [[key, entry] as const] : [],
    ),
  );
}

function foundFrom(service: Bonjour.Service, address: string | null): FoundService | null {
  if (address === null) return null;
  return {
    fqdn: service.fqdn.toLowerCase(),
    name: service.name,
    host: service.host,
    port: service.port,
    address,
    txt: textOf(service.txt),
  };
}

function signature(found: FoundService): string {
  return JSON.stringify([found.address, found.host, found.port, [...found.txt]]);
}

function repeatQuery(browser: Bonjour.Browser): () => void {
  const timers = QUERY_REPEAT_MS.map((delay) => {
    const timer = setTimeout(() => {
      browser.update();
    }, delay);
    timer.unref();
    return timer;
  });
  return () => {
    for (const timer of timers) clearTimeout(timer);
  };
}

export function watchServices(mdns: Mdns, type: string, handlers: ServiceHandlers): ServiceWatch {
  const browser = mdns.bonjour.find({ type });
  const emitted = new Map<string, string>();
  const books = new Map<string, AddressBook>();
  const announce = (
    service: Bonjour.Service,
    addresses: readonly string[],
    from?: string,
  ): void => {
    const host = service.host.toLowerCase();
    const book = books.get(host) ?? new AddressBook();
    books.set(host, book);
    const found = foundFrom(service, book.consider(addresses, from));
    if (found === null || emitted.get(found.fqdn) === signature(found)) return;
    emitted.set(found.fqdn, signature(found));
    handlers.found(found);
  };
  const announced = (service: Bonjour.Service): void => {
    announce(service, service.addresses ?? [], service.referer?.address);
  };
  browser.on('up', announced);
  browser.on('txt-update', announced);
  browser.on('srv-update', announced);
  browser.on('down', (service) => {
    const fqdn = service.fqdn.toLowerCase();
    emitted.delete(fqdn);
    books.delete(service.host.toLowerCase());
    handlers.lost?.(fqdn);
  });
  const stopRecords = mdns.onAddressRecords((record) => {
    for (const service of browser.services)
      if (service.host.toLowerCase() === record.host)
        announce(service, record.addresses, record.from);
  });
  const cancelRepeats = repeatQuery(browser);
  const rediscover = (): void => {
    browser.update();
  };
  const stop = (): void => {
    cancelRepeats();
    stopRecords();
    browser.stop();
  };
  return { rediscover, stop };
}
