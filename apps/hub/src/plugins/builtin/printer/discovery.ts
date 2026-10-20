import { watchServices, type FoundService, type Mdns, type OpenMdns } from '../../../network/mdns';

export interface Candidate {
  readonly key: string;
  readonly uuid: string | null;
  readonly name: string;
  readonly model: string | null;
  readonly location: string | null;
  readonly uri: string;
  readonly secure: boolean;
  readonly authentication: boolean;
  readonly adminUrl: string | null;
  readonly fqdn: string;
}

export interface DiscoveryHandlers {
  readonly found: (candidate: Candidate) => void;
  readonly lost: (candidate: Candidate) => void;
}

const SERVICE_TYPES: readonly (readonly [string, boolean])[] = [
  ['ipps', true],
  ['ipp', false],
];

function uuidOf(service: FoundService): string | null {
  return (
    service.txt
      .get('UUID')
      ?.replace(/^urn:uuid:/iu, '')
      .toLowerCase() ?? null
  );
}

function candidateOf(service: FoundService, secure: boolean): Candidate | null {
  const path = service.txt.get('rp');
  if (path === undefined) return null;
  const uuid = uuidOf(service);
  const host = service.address.includes(':') ? `[${service.address}]` : service.address;
  const air = service.txt.get('air');
  return {
    key: uuid ?? `${service.host.toLowerCase()}/${path}`,
    uuid,
    name: service.name,
    model: service.txt.get('ty') ?? null,
    location: service.txt.get('note') ?? null,
    uri: `${secure ? 'ipps' : 'ipp'}://${host}:${String(service.port)}/${path}`,
    secure,
    authentication: air !== undefined && air !== 'none',
    adminUrl: service.txt.get('adminurl') ?? null,
    fqdn: service.fqdn,
  };
}

export class PrinterDiscovery {
  readonly #found = new Map<string, Candidate>();
  #mdns: Mdns | null = null;
  #stops: (() => void)[] = [];
  #rediscover: (() => void)[] = [];

  constructor(
    private readonly open: OpenMdns,
    private readonly handlers: DiscoveryHandlers,
    private readonly failed: (cause: unknown) => void,
  ) {}

  start(): void {
    const mdns = this.open(this.failed);
    this.#mdns = mdns;
    for (const [type, secure] of SERVICE_TYPES) {
      const watch = watchServices(mdns, type, {
        found: (service) => {
          const candidate = candidateOf(service, secure);
          if (candidate === null) return;
          const known = this.#found.get(candidate.key);
          if (known?.secure === true && !secure) return;
          this.#found.set(candidate.key, candidate);
          this.handlers.found(candidate);
        },
        lost: (fqdn) => {
          for (const candidate of this.#found.values()) {
            if (candidate.fqdn !== fqdn) continue;
            this.#found.delete(candidate.key);
            this.handlers.lost(candidate);
          }
        },
      });
      this.#stops.push(watch.stop);
      this.#rediscover.push(watch.rediscover);
    }
  }

  candidates(): readonly Candidate[] {
    return [...this.#found.values()];
  }

  rescan(): void {
    for (const rediscover of this.#rediscover) rediscover();
  }

  async stop(): Promise<void> {
    for (const stop of this.#stops) stop();
    this.#stops = [];
    this.#rediscover = [];
    await this.#mdns?.close();
    this.#mdns = null;
  }
}
