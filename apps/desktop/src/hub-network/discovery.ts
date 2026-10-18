import { findHubs } from '@smarteverything/hub/client-network/hub-discovery';
import type { HubDiscoveryCandidate, NativeHubDiscovery } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import {
  openMdns,
  type Mdns,
  type OpenMdns,
  type ServiceWatch,
} from '@smarteverything/hub/network/mdns';

const log = new Logger('desktop.hub-discovery');

const SEARCH_MS = 30_000;
const UNAVAILABLE = 'Nearby search isn’t running. Enter the pairing code instead.';

export class HubDiscovery {
  #generation = 0;
  #mdns: Mdns | undefined;
  #watch: ServiceWatch | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #candidates = new Map<string, HubDiscoveryCandidate>();
  constructor(
    readonly emit: (state: NativeHubDiscovery) => void,
    readonly open: OpenMdns = openMdns,
  ) {}
  start(): NativeHubDiscovery {
    this.stop();
    const generation = ++this.#generation;
    log.info('discovery.started', { generation, searchMs: SEARCH_MS });
    const mdns = this.open((cause) => {
      if (generation !== this.#generation) {
        log.debug('discovery.error_ignored', { generation, current: this.#generation });
        return;
      }
      log.warn('discovery.unavailable', {
        generation,
        reason: cause instanceof Error ? cause.name : 'unknown',
      });
      this.emit(
        this.#snapshot('unavailable', cause instanceof Error ? cause.message : UNAVAILABLE),
      );
    });
    this.#mdns = mdns;
    this.#watch = findHubs(mdns, {
      found: (key, candidate) => {
        if (generation !== this.#generation) return;
        this.#candidates.set(key, candidate);
        log.debug('discovery.found', { generation, candidates: this.#candidates.size });
        this.emit(this.#snapshot('searching', ''));
      },
      lost: (key) => {
        if (generation !== this.#generation || !this.#candidates.delete(key)) return;
        log.debug('discovery.lost', { generation, candidates: this.#candidates.size });
        this.emit(this.#snapshot('searching', ''));
      },
    });
    this.#timer = setTimeout(() => {
      log.info('discovery.timed_out', { generation, candidates: this.#candidates.size });
      this.stop();
    }, SEARCH_MS);
    this.#timer.unref();
    return this.#snapshot('searching', '');
  }
  stop(): void {
    log.info('discovery.stopped', {
      generation: this.#generation,
      candidates: this.#candidates.size,
    });
    this.#generation += 1;
    clearTimeout(this.#timer);
    this.#watch?.stop();
    background(this.#mdns?.close(), 'discovery.close_failed');
    this.#watch = undefined;
    this.#mdns = undefined;
    this.#candidates.clear();
    this.emit(this.#snapshot('idle', ''));
  }
  #snapshot(state: NativeHubDiscovery['state'], detail: string): NativeHubDiscovery {
    return {
      generation: this.#generation,
      state,
      detail,
      candidates: [...this.#candidates.values()],
    };
  }
}
