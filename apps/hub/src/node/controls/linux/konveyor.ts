import type { ComputerFeature, TilingChange, TilingState } from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';
import type { StopWatching, TilingControl } from '../session-controls';
import type { SessionBus } from './dbus-session';
import { konveyorActionJson } from './konveyor-action';
import {
  KONVEYOR_OUTPUTS,
  KONVEYOR_OVERVIEW,
  KONVEYOR_WINDOWS,
  KONVEYOR_WORKSPACES,
  tilingStateOf,
} from './konveyor-wire';

const log = new Logger('hub.node-tiling');

const KONVEYOR = {
  destination: 'org.kde.Konveyor',
  path: '/Konveyor',
  iface: 'org.kde.Konveyor',
} as const;

const DAEMON = {
  destination: 'org.freedesktop.DBus',
  path: '/org/freedesktop/DBus',
  iface: 'org.freedesktop.DBus',
} as const;

const ANSWER = z.tuple([z.string()]);
const HAS_OWNER = z.tuple([z.boolean()]);
const OWNER_CHANGED = z.tuple([z.string(), z.string(), z.string()]);

const MISSING_TEXT = 'Konveyor is not running on this computer.';

export type KonveyorBus = Pick<SessionBus, 'call' | 'watch' | 'close'>;

export interface KonveyorTilingOptions {
  readonly open: () => Promise<KonveyorBus>;
  readonly failed: (cause: unknown) => void;
}

class Subscription {
  private stopped = false;
  private unwatch: StopWatching | null = null;

  adopt(stop: StopWatching): void {
    if (this.stopped) {
      stop();
    } else {
      this.unwatch = stop;
    }
  }

  cancel(): void {
    this.stopped = true;
    this.unwatch?.();
    this.unwatch = null;
  }
}

export class KonveyorTiling implements TilingControl {
  private connection: Promise<KonveyorBus> | null = null;
  private readonly listeners = new Set<(state: TilingState) => void>();
  private stopLayout: StopWatching | null = null;
  private reading = false;
  private dirty = false;
  private last = '';

  constructor(private readonly options: KonveyorTilingOptions) {}

  async features(): Promise<readonly ComputerFeature[]> {
    try {
      return (await this.owned()) ? ['tiling'] : [];
    } catch (cause) {
      if (cause instanceof NodeFailureError && cause.code === 'no_session') {
        return [];
      }
      throw cause;
    }
  }

  async read(): Promise<TilingState> {
    await this.require();
    const [windows, workspaces, outputs, overview] = await Promise.all([
      this.json('Windows', KONVEYOR_WINDOWS),
      this.json('Workspaces', KONVEYOR_WORKSPACES),
      this.json('Outputs', KONVEYOR_OUTPUTS),
      this.json('OverviewState', KONVEYOR_OVERVIEW),
    ]);
    return tilingStateOf({ windows, workspaces, outputs, overview });
  }

  async change(change: TilingChange): Promise<TilingState> {
    await this.require();
    const bus = await this.attach();
    const [refusal] = ANSWER.parse(
      await bus.call({
        ...KONVEYOR,
        member: 'Action',
        signature: 's',
        body: [konveyorActionJson(change)],
      }),
    );
    if (refusal !== '') {
      throw new NodeFailureError('failed', `Konveyor did not do that: ${refusal}`);
    }
    log.info('tiling.change_applied', { action: change.action });
    return this.read();
  }

  watch(onChange: (state: TilingState) => void): StopWatching {
    this.listeners.add(onChange);
    this.last = '';
    this.stopLayout ??= this.follow();
    this.refresh();
    return (): void => {
      this.listeners.delete(onChange);
      if (this.listeners.size === 0) {
        this.stopLayout?.();
        this.stopLayout = null;
        this.last = '';
        log.debug('tiling.watch_stopped');
      }
    };
  }

  watchPresence(onChange: () => void): StopWatching {
    return this.subscribe(
      { ...DAEMON, sender: DAEMON.destination, member: 'NameOwnerChanged' },
      (body) => {
        const [name] = OWNER_CHANGED.parse(body);
        if (name === KONVEYOR.destination) {
          onChange();
        }
      },
    );
  }

  async stop(): Promise<void> {
    this.listeners.clear();
    this.stopLayout?.();
    this.stopLayout = null;
    const connection = this.connection;
    this.connection = null;
    if (connection !== null) {
      (await connection).close();
    }
  }

  private follow(): StopWatching {
    const stopSignal = this.subscribe(
      {
        sender: KONVEYOR.destination,
        path: KONVEYOR.path,
        iface: KONVEYOR.iface,
        member: 'LayoutChanged',
      },
      () => {
        this.refresh();
      },
    );
    const stopPresence = this.watchPresence(() => {
      this.refresh();
    });
    return (): void => {
      stopSignal();
      stopPresence();
    };
  }

  private subscribe(
    rule: Parameters<KonveyorBus['watch']>[0],
    listener: Parameters<KonveyorBus['watch']>[1],
  ): StopWatching {
    const subscription = new Subscription();
    this.attach()
      .then((bus) => bus.watch(rule, listener))
      .then((stop) => {
        subscription.adopt(stop);
      })
      .catch(this.unreachable);
    return (): void => {
      subscription.cancel();
    };
  }

  private readonly unreachable = (cause: unknown): void => {
    if (cause instanceof NodeFailureError && cause.code === 'no_session') {
      log.debug('tiling.no_session', { reason: cause.message });
      return;
    }
    this.options.failed(cause);
  };

  private refresh(): void {
    if (this.reading) {
      this.dirty = true;
      return;
    }
    this.reading = true;
    this.settle()
      .catch(this.options.failed)
      .finally(() => {
        this.reading = false;
      });
  }

  private async settle(): Promise<void> {
    do {
      await this.publish();
    } while (this.takeDirty());
  }

  private takeDirty(): boolean {
    const dirty = this.dirty;
    this.dirty = false;
    return dirty;
  }

  private async publish(): Promise<void> {
    if (this.listeners.size === 0 || !(await this.owned())) {
      return;
    }
    const state = await this.read();
    const serial = JSON.stringify(state);
    if (serial === this.last) {
      return;
    }
    this.last = serial;
    this.listeners.forEach((listener) => {
      listener(state);
    });
  }

  private attach(): Promise<KonveyorBus> {
    this.connection ??= this.options.open().catch((cause: unknown) => {
      this.connection = null;
      throw cause;
    });
    return this.connection;
  }

  private async owned(): Promise<boolean> {
    const bus = await this.attach();
    const [owned] = HAS_OWNER.parse(
      await bus.call({
        ...DAEMON,
        member: 'NameHasOwner',
        signature: 's',
        body: [KONVEYOR.destination],
      }),
    );
    return owned;
  }

  private async require(): Promise<void> {
    if (!(await this.owned())) {
      throw new NodeFailureError('not_supported', MISSING_TEXT);
    }
  }

  private async json<T>(member: string, schema: z.ZodType<T>): Promise<T> {
    const bus = await this.attach();
    const [text] = ANSWER.parse(await bus.call({ ...KONVEYOR, member }));
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (cause) {
      throw new NodeFailureError(
        'failed',
        `Konveyor ${member} did not answer with JSON: ${messageOf(cause)}`,
      );
    }
    return schema.parse(parsed);
  }
}
