import type { HubDiscoveryCandidate, NativeHubDiscovery } from '@smarteverything/domain';
import { AvahiDiscovery } from './avahi.js';
import type { HubPairingInspection } from '../../../../packages/domain/src/hub-pairing';
import { HubTransportError } from './policy.js';
export class HubDiscovery {
  #generation = 0;
  #state: NativeHubDiscovery['state'] = 'idle';
  #source: AvahiDiscovery | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #candidates = new Map<string, HubDiscoveryCandidate>();
  constructor(readonly emit: (state: NativeHubDiscovery) => void) {}
  selected(input: HubPairingInspection): HubDiscoveryCandidate {
    const candidate = [...this.#candidates.values()].find((entry) => entry.url === input.url);
    if (
      this.#state !== 'searching' ||
      this.#source === undefined ||
      input.generation !== this.#generation ||
      candidate === undefined
    )
      throw new HubTransportError('Pairing inspection requires a current discovered candidate');
    return candidate;
  }
  async start(): Promise<NativeHubDiscovery> {
    this.stop();
    const generation = ++this.#generation;
    if (process.platform !== 'linux')
      return this.#snapshot('unsupported', 'Local discovery requires Linux Avahi');
    const source = new AvahiDiscovery(
      (key, candidate) => {
        if (generation !== this.#generation) return;
        if (candidate === null) this.#candidates.delete(key);
        else if (this.#candidates.size < 64) this.#candidates.set(key, candidate);
        this.emit(this.#snapshot('searching', ''));
      },
      (cause) => {
        if (generation !== this.#generation) return;
        this.emit(
          this.#snapshot(
            'unavailable',
            cause instanceof Error ? cause.message : 'Avahi unavailable',
          ),
        );
      },
    );
    this.#source = source;
    this.#timer = setTimeout(() => {
      this.stop();
    }, 30_000);
    this.#timer.unref();
    try {
      await source.start();
    } catch (cause) {
      if (generation === this.#generation) {
        this.stop();
        return this.#snapshot(
          'unavailable',
          cause instanceof Error ? cause.message : 'Avahi unavailable',
        );
      }
    }
    return this.#snapshot(generation === this.#generation ? 'searching' : 'idle', '');
  }
  stop(): void {
    this.#generation += 1;
    clearTimeout(this.#timer);
    this.#source?.stop();
    this.#source = undefined;
    this.#candidates.clear();
    this.emit(this.#snapshot('idle', ''));
  }
  #snapshot(state: NativeHubDiscovery['state'], detail: string): NativeHubDiscovery {
    this.#state = state;
    return {
      generation: this.#generation,
      state,
      detail: detail.slice(0, 500),
      candidates: [...this.#candidates.values()],
    };
  }
}
