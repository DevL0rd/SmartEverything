import { patchAll, patchMember, type AnyFunction } from './patch-global';
import { addContributor, currentScreen, logEvent } from './window-bus';
import { perSecond, type WindowFields } from './window-math';

export type TimerKind = 'timeout' | 'interval' | 'frame';

interface Alive {
  readonly kind: TimerKind;
  readonly screen: string;
}

const TOP_SCREENS = 6;

export class AliveTimers {
  private readonly alive = new Map<unknown, Alive>();
  private created = { timeout: 0, interval: 0, frame: 0 };

  open(id: unknown, kind: TimerKind, screen: string): void {
    this.alive.set(id, { kind, screen });
    this.created[kind] += 1;
  }

  done(id: unknown): void {
    this.alive.delete(id);
  }

  fields(windowMs: number, screen: string): WindowFields {
    let timeouts = 0;
    let intervals = 0;
    let left = 0;
    this.alive.forEach((timer) => {
      timeouts += timer.kind === 'timeout' ? 1 : 0;
      intervals += timer.kind === 'interval' ? 1 : 0;
      left += timer.kind === 'interval' && timer.screen !== screen ? 1 : 0;
    });
    const fields: WindowFields = {
      tAlive: timeouts,
      iAlive: intervals,
      iLeft: left,
      tNewPerS: perSecond(this.created.timeout, windowMs),
      iNew: this.created.interval,
      rafPerS: perSecond(this.created.frame, windowMs),
    };
    this.created = { timeout: 0, interval: 0, frame: 0 };
    return fields;
  }

  intervalsByScreen(): string {
    const counts = new Map<string, number>();
    this.alive.forEach((timer) => {
      if (timer.kind === 'interval') {
        counts.set(timer.screen, (counts.get(timer.screen) ?? 0) + 1);
      }
    });
    return [...counts]
      .sort(([, a], [, b]) => b - a)
      .slice(0, TOP_SCREENS)
      .map(([screen, count]) => `${screen}:${String(count)}`)
      .join(',');
  }
}

function scheduling(table: AliveTimers, kind: TimerKind): (original: AnyFunction) => AnyFunction {
  return (original) =>
    function (this: unknown, ...args: unknown[]): unknown {
      const [handler, ...rest] = args;
      if (typeof handler !== 'function') {
        return Reflect.apply(original, this, args);
      }
      let id: unknown = null;
      const run = function (this: unknown, ...runArgs: unknown[]): unknown {
        if (kind !== 'interval') {
          table.done(id);
        }
        return Reflect.apply(handler, this, runArgs);
      };
      id = Reflect.apply(original, this, [run, ...rest]);
      table.open(id, kind, currentScreen());
      return id;
    };
}

function clearing(table: AliveTimers): (original: AnyFunction) => AnyFunction {
  return (original) =>
    function (this: unknown, ...args: unknown[]): unknown {
      table.done(args[0]);
      return Reflect.apply(original, this, args);
    };
}

export function startTimerProbe(): () => void {
  const table = new AliveTimers();
  const patches = patchAll([
    patchMember(globalThis, 'setTimeout', scheduling(table, 'timeout')),
    patchMember(globalThis, 'setInterval', scheduling(table, 'interval')),
    patchMember(globalThis, 'requestAnimationFrame', scheduling(table, 'frame')),
    patchMember(globalThis, 'clearTimeout', clearing(table)),
    patchMember(globalThis, 'clearInterval', clearing(table)),
    patchMember(globalThis, 'cancelAnimationFrame', clearing(table)),
  ]);
  if (patches.failed > 0) {
    logEvent('perf.probe_partial', { probe: 'timers', failed: patches.failed });
  }
  const remove = addContributor('timers', {
    fields: (windowMs) => table.fields(windowMs, currentScreen()),
    details: () => [{ kind: 'intervals', top: table.intervalsByScreen() }],
  });
  return (): void => {
    remove();
    patches.stop();
  };
}
