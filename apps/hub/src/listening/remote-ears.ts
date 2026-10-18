import type { ListeningRuntimeState } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Listeners } from '../listeners';
import { RemoteEarSession, type RemoteEarDeps } from './remote-ear';
import type { EarHosts } from './ear-hosts';
import type { RemoteEar, RemoteEarOptions, RemoteEars } from './remote-ears-port';

export class EarKeyConflictError extends Error {
  override readonly name = 'EarKeyConflictError';

  constructor(
    readonly key: string,
    readonly openKind: string,
    readonly askedKind: string,
  ) {
    super(
      `The ear key ${key} is already open for a ${openKind} source; a ${askedKind} source needs its own key.`,
    );
  }
}

export interface RemoteEarStates {
  readonly key: string;
  readonly state: ListeningRuntimeState | null;
}

export type HubRemoteEarsDeps = Omit<RemoteEarDeps, 'stated' | 'released' | 'hosts'> & {
  readonly hosts: Pick<EarHosts, 'host' | 'sendTo' | 'onMove' | 'onRelayed'>;
  readonly pause: RemoteEarDeps['pause'] & {
    readonly onChange: (listener: () => void) => () => void;
  };
};

const INERT: RemoteEar = {
  packet: (): void => undefined,
  close: (): Promise<void> => Promise.resolve(),
};

export class HubRemoteEars implements RemoteEars {
  private readonly ears = new Map<string, RemoteEarSession>();
  private readonly shown = new Map<string, ListeningRuntimeState>();
  private readonly states = new Listeners<RemoteEarStates>();
  private stops: (() => void)[] = [];

  constructor(private readonly deps: HubRemoteEarsDeps) {}

  start(): void {
    const { hosts, pause } = this.deps;
    this.stops = [
      hosts.onMove(({ to }) => {
        this.ears.forEach((ear) => {
          ear.attach(to);
        });
      }),
      hosts.onRelayed(({ computerId, key, message }) => {
        const ear = this.ears.get(key);
        if (ear?.host === computerId) ear.heard(message);
        else this.deps.log.debug('ears.relayed_dropped', { computerId, key });
      }),
      pause.onChange(() => {
        this.ears.forEach((ear) => {
          ear.refresh();
        });
      }),
    ];
  }

  stop(): void {
    this.stops.splice(0).forEach((stop) => {
      stop();
    });
    [...this.ears.values()].forEach((ear) => {
      background(ear.close(), 'remote_ears.close_failed');
    });
  }

  onState(listener: (change: RemoteEarStates) => void): () => void {
    return this.states.listen(listener);
  }

  async open(options: RemoteEarOptions): Promise<RemoteEar> {
    if (options.speech === null && options.wake === null) return INERT;
    const { key, kind } = options.source;
    const open = this.ears.get(key);
    if (open !== undefined) {
      if (open.kind !== kind) throw new EarKeyConflictError(key, open.kind, kind);
      await open.close();
    }
    const ear = new RemoteEarSession(options, {
      ...this.deps,
      stated: (): void => {
        this.publish(ear.listeningKey);
      },
      released: (gone): void => {
        if (this.ears.get(gone.key) === gone) this.ears.delete(gone.key);
        this.publish(gone.listeningKey);
      },
    });
    this.ears.set(key, ear);
    ear.attach(this.deps.hosts.host());
    this.publish(ear.listeningKey);
    return ear;
  }

  private publish(listeningKey: string): void {
    const state = this.stateOf(listeningKey);
    if (this.shown.get(listeningKey) === (state ?? undefined)) return;
    if (state === null) this.shown.delete(listeningKey);
    else this.shown.set(listeningKey, state);
    this.states.emit({ key: listeningKey, state });
  }

  private stateOf(listeningKey: string): ListeningRuntimeState | null {
    const states = [...this.ears.values()]
      .filter((ear) => ear.listeningKey === listeningKey)
      .map((ear) => ear.state());
    if (states.includes('no_host')) return 'no_host';
    return states.find((state) => state !== null) ?? null;
  }
}
