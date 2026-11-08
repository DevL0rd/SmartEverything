import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { BusCall, SignalListener, SignalRule } from './dbus-session';
import { variant } from './dbus-session';

const log = new Logger('hub.node-session-environment');

const MANAGER = {
  destination: 'org.freedesktop.systemd1',
  path: '/org/freedesktop/systemd1',
  iface: 'org.freedesktop.systemd1.Manager',
} as const;

const GRAPHICAL_SESSION = 'graphical-session.target';

const SESSION_VARIABLES = [
  'WAYLAND_DISPLAY',
  'DISPLAY',
  'XAUTHORITY',
  'XDG_CURRENT_DESKTOP',
  'XDG_SESSION_TYPE',
  'XDG_SESSION_DESKTOP',
  'DESKTOP_SESSION',
  'KDE_FULL_SESSION',
  'XDG_DATA_HOME',
  'XDG_DATA_DIRS',
] as const;

const ENVIRONMENT = z.tuple([variant(z.array(z.string()))]);
const JOB_REMOVED = z.tuple([z.number(), z.string(), z.string(), z.string()]);

export interface ManagerBus {
  readonly call: (request: BusCall) => Promise<readonly unknown[]>;
  readonly watch: (rule: SignalRule, listener: SignalListener) => Promise<() => void>;
  readonly close: () => void;
}

export type ProcessVariables = Record<string, string | undefined>;

export interface UserManagerEnvironmentOptions {
  readonly open: (onError: (cause: unknown) => void) => Promise<ManagerBus>;
  readonly target: ProcessVariables;
  readonly failed: (cause: unknown) => void;
}

function parsed(lines: readonly string[]): ReadonlyMap<string, string> {
  const variables = new Map<string, string>();
  for (const line of lines) {
    const split = line.indexOf('=');
    if (split > 0) {
      variables.set(line.slice(0, split), line.slice(split + 1));
    }
  }
  return variables;
}

export class UserManagerEnvironment {
  private bus: ManagerBus | null = null;
  private unwatch: (() => void) | null = null;
  private onChange: (() => void) | null = null;
  private readonly applied = new Set<string>();
  private generation = 0;

  constructor(private readonly options: UserManagerEnvironmentOptions) {}

  async start(onChange: () => void): Promise<void> {
    this.stop();
    const generation = ++this.generation;
    this.onChange = onChange;
    const bus = await this.options.open(this.options.failed);
    if (generation !== this.generation) {
      bus.close();
      return;
    }
    this.bus = bus;
    this.unwatch = await bus.watch(
      {
        sender: MANAGER.destination,
        path: MANAGER.path,
        iface: MANAGER.iface,
        member: 'JobRemoved',
      },
      (body) => {
        if (this.graphicalSessionJob(body)) {
          this.refresh(bus).catch(this.options.failed);
        }
      },
    );
    await bus.call({ ...MANAGER, member: 'Subscribe' });
    await this.read(bus);
  }

  stop(): void {
    this.generation += 1;
    this.unwatch?.();
    this.unwatch = null;
    this.bus?.close();
    this.bus = null;
    this.onChange = null;
  }

  private graphicalSessionJob(body: readonly unknown[]): boolean {
    const job = JOB_REMOVED.safeParse(body);
    return job.success && job.data[2] === GRAPHICAL_SESSION;
  }

  private async refresh(bus: ManagerBus): Promise<void> {
    if ((await this.read(bus)) && this.bus === bus) {
      this.onChange?.();
    }
  }

  private async read(bus: ManagerBus): Promise<boolean> {
    const [lines] = ENVIRONMENT.parse(
      await bus.call({
        ...MANAGER,
        iface: 'org.freedesktop.DBus.Properties',
        member: 'Get',
        signature: 'ss',
        body: [MANAGER.iface, 'Environment'],
      }),
    );
    return this.apply(parsed(lines));
  }

  private apply(variables: ReadonlyMap<string, string>): boolean {
    const { target } = this.options;
    const changed: string[] = [];
    for (const name of SESSION_VARIABLES) {
      const wanted = variables.get(name);
      if (wanted !== undefined && target[name] !== wanted) {
        target[name] = wanted;
        this.applied.add(name);
        changed.push(name);
      } else if (wanted === undefined && this.applied.delete(name)) {
        Reflect.deleteProperty(target, name);
        changed.push(name);
      }
    }
    if (changed.length > 0) {
      log.info('session_environment.applied', { changed });
    }
    return changed.length > 0;
  }
}
