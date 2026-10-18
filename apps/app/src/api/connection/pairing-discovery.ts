import { AppState } from 'react-native';
import { Logger } from '@smarteverything/logging';
import {
  NATIVE_HUB_DISCOVERY,
  type HubDiscoveryCandidate,
  type NativeHubDiscovery,
} from '@smarteverything/domain';
import { ValueStore } from '../../design/external-store';
import { appPlatform } from '../../design/platform';
import { hubNetwork } from './route-platform';
import { releasePairingResources } from './pairing-errors';

const log = new Logger('app.pairing');
const UNSUPPORTED: NativeHubDiscovery = {
  generation: 0,
  state: 'unsupported',
  detail: '',
  candidates: [],
};
const UNAVAILABLE: NativeHubDiscovery = { ...UNSUPPORTED, state: 'unavailable' };

function failure(error: unknown): { readonly failure: string } {
  return { failure: error instanceof Error ? error.name : 'NativeFailure' };
}

export class PairingDiscovery {
  readonly state = new ValueStore<NativeHubDiscovery>({ ...UNSUPPORTED, state: 'idle' });
  private epoch = 0;
  private unsubscribe: (() => void) | null = null;
  private lifecycle: (() => void) | null = null;
  start(): void {
    if (this.lifecycle !== null) return;
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') this.search();
      else this.pause();
    });
    this.lifecycle = (): void => {
      foreground.remove();
    };
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive')
      this.search();
  }
  search(): void {
    const epoch = ++this.epoch;
    if (appPlatform() === 'web' || hubNetwork().capabilities.pairingInspection !== true) {
      this.accept(UNSUPPORTED, epoch);
      return;
    }
    this.unsubscribe?.();
    this.unsubscribe = hubNetwork().subscribeDiscovery((state) => {
      this.accept(state, epoch);
    });
    void this.scan(epoch).catch((error: unknown) => {
      if (epoch === this.epoch) this.accept(UNAVAILABLE, epoch);
      log.warn('pairing.discovery_failed', failure(error));
    });
  }
  private async scan(epoch: number): Promise<void> {
    await hubNetwork().stopDiscovery();
    if (epoch !== this.epoch) return;
    this.state.set({ ...this.state.get(), state: 'searching', candidates: [] });
    this.accept(await hubNetwork().startDiscovery(), epoch);
  }
  private accept(value: NativeHubDiscovery, epoch: number): void {
    if (epoch !== this.epoch) return;
    const incoming = NATIVE_HUB_DISCOVERY.parse(value);
    const previous = this.state.get();
    const candidates = new Map(incoming.candidates.map((candidate) => [candidate.url, candidate]));
    const kept =
      previous.generation === incoming.generation
        ? previous.candidates.filter((candidate) => candidates.has(candidate.url))
        : [];
    const known = new Set(kept.map((candidate) => candidate.url));
    this.state.set({
      ...incoming,
      candidates: [
        ...kept.flatMap((candidate) => candidates.get(candidate.url) ?? []),
        ...incoming.candidates.filter((candidate) => !known.has(candidate.url)),
      ],
    });
  }
  candidate(url: string): HubDiscoveryCandidate | null {
    return this.state.get().candidates.find((entry) => entry.url === url) ?? null;
  }
  private pause(): void {
    this.epoch += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    void hubNetwork()
      .stopDiscovery()
      .catch((error: unknown) => {
        log.warn('pairing.discovery_stop_failed', failure(error));
      });
  }
  async stop(): Promise<void> {
    this.epoch += 1;
    const { unsubscribe, lifecycle } = this;
    this.unsubscribe = null;
    this.lifecycle = null;
    await releasePairingResources([
      { operation: 'discovery-subscription', release: (): void => unsubscribe?.() },
      { operation: 'foreground-subscription', release: (): void => lifecycle?.() },
      { operation: 'discovery', release: (): Promise<void> => hubNetwork().stopDiscovery() },
    ]);
  }
}
