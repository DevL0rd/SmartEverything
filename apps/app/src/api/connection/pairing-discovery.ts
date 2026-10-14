import { AppState } from 'react-native';
import { Logger } from '@smarteverything/logging';
import {
  NATIVE_HUB_DISCOVERY,
  HUB_DISCOVERY_CANDIDATE,
  type HubDiscoveryCandidate,
  type NativeHubDiscovery,
} from '@smarteverything/domain';
import { ValueStore } from '../../design/external-store';
import { appPlatform } from '../../design/platform';
import { hubNetwork } from './route-platform';
import { releasePairingResources } from './pairing-transport';

const log = new Logger('app.pairing');
export class PairingDiscovery {
  readonly state = new ValueStore<NativeHubDiscovery>({
    generation: 0,
    state: 'idle',
    detail: '',
    candidates: [],
  });
  private epoch = 0;
  private active = false;
  private unsubscribe: (() => void) | null = null;
  private lifecycle: (() => void) | null = null;
  private network: (() => void) | null = null;
  constructor(private readonly changed: (retired: boolean) => void) {}
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
    this.changed(true);
    const epoch = ++this.epoch;
    this.active = true;
    if (appPlatform() === 'web' || hubNetwork().capabilities.pairingInspection !== true) {
      this.accept({ generation: 0, state: 'unsupported', detail: '', candidates: [] }, epoch);
      return;
    }
    this.subscribe(epoch);
    void this.scan(epoch).catch((error: unknown) => {
      if (epoch === this.epoch)
        this.accept({ generation: 0, state: 'unavailable', detail: '', candidates: [] }, epoch);
      log.warn('pairing.discovery_failed', {
        failure: error instanceof Error ? error.name : 'NativeFailure',
      });
    });
  }
  private subscribe(epoch: number): void {
    this.unsubscribe?.();
    this.unsubscribe = hubNetwork().subscribeDiscovery((state) => {
      this.accept(state, epoch);
    });
    if (this.network !== null) return;
    this.network = hubNetwork().subscribeNetwork(() => {
      if (!this.active) return;
      this.changed(true);
    });
    void hubNetwork()
      .startNetwork()
      .catch((error: unknown) => {
        log.warn('pairing.network_failed', {
          failure: error instanceof Error ? error.name : 'NativeFailure',
        });
      });
  }
  private async scan(epoch: number): Promise<void> {
    await hubNetwork().stopDiscovery();
    if (epoch !== this.epoch || !this.active) return;
    this.state.set({ ...this.state.get(), state: 'searching', candidates: [] });
    this.accept(await hubNetwork().startDiscovery(), epoch);
  }
  private accept(value: NativeHubDiscovery, epoch: number): void {
    if (!this.active || epoch !== this.epoch) return;
    const incoming = NATIVE_HUB_DISCOVERY.parse(value);
    const previous = this.state.get();
    const candidates = new Map(incoming.candidates.map((candidate) => [candidate.url, candidate]));
    const retained =
      previous.generation === incoming.generation
        ? previous.candidates.filter((candidate) => candidates.has(candidate.url))
        : [];
    const distinct = new Map(
      retained.map((candidate) => [candidate.url, candidates.get(candidate.url)]),
    );
    for (const candidate of incoming.candidates)
      if (!distinct.has(candidate.url)) distinct.set(candidate.url, candidate);
    this.state.set({
      ...incoming,
      candidates: [...distinct.values()].filter((candidate) => candidate !== undefined),
    });
    this.changed(false);
  }
  selected(
    url: string,
  ): { readonly candidate: HubDiscoveryCandidate; readonly generation: number } | null {
    const snapshot = this.state.get();
    const candidate = snapshot.candidates.find((entry) => entry.url === url);
    return candidate === undefined
      ? null
      : {
          candidate: Object.freeze(HUB_DISCOVERY_CANDIDATE.parse(candidate)),
          generation: snapshot.generation,
        };
  }
  isCurrent(candidate: HubDiscoveryCandidate, generation: number): boolean {
    const current = this.selected(candidate.url);
    return (
      this.active &&
      current !== null &&
      current.generation === generation &&
      JSON.stringify(current.candidate) === JSON.stringify(candidate)
    );
  }
  private pause(notify = true): void {
    this.active = false;
    this.epoch += 1;
    if (notify) this.changed(true);
    this.unsubscribe?.();
    this.unsubscribe = null;
    void hubNetwork()
      .stopDiscovery()
      .catch((error: unknown) => {
        log.warn('pairing.discovery_stop_failed', {
          failure: error instanceof Error ? error.name : 'NativeFailure',
        });
      });
  }
  async stop(notify = true): Promise<void> {
    this.active = false;
    this.epoch += 1;
    const unsubscribe = this.unsubscribe;
    const lifecycle = this.lifecycle;
    const network = this.network;
    this.unsubscribe = null;
    this.lifecycle = null;
    this.network = null;
    await releasePairingResources([
      {
        operation: 'selection',
        release: (): void => {
          if (notify) this.changed(true);
        },
      },
      {
        operation: 'discovery-subscription',
        release: (): void => {
          unsubscribe?.();
        },
      },
      {
        operation: 'foreground-subscription',
        release: (): void => {
          lifecycle?.();
        },
      },
      {
        operation: 'network-subscription',
        release: (): void => {
          network?.();
        },
      },
      { operation: 'network', release: (): Promise<void> => hubNetwork().stopNetwork() },
      { operation: 'discovery', release: (): Promise<void> => hubNetwork().stopDiscovery() },
    ]);
  }
}
