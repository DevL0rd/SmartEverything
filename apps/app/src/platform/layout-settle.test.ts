import { describe, expect, it } from 'vitest';
import { LayoutSettle } from './layout-settle';

interface Scene {
  readonly settle: LayoutSettle<string>;
  readonly measured: string[];
  readonly drain: () => void;
}

function scene(
  changes: ReadonlyMap<string, number>,
  rerenders: ReadonlyMap<string, readonly string[]>,
): Scene {
  const measured: string[] = [];
  const tasks: (() => void)[] = [];
  const left = new Map(changes);
  const settle: LayoutSettle<string> = new LayoutSettle<string>({
    deliver: (node): boolean => {
      measured.push(node);
      const times = left.get(node) ?? 0;
      if (times === 0) return false;
      left.set(node, times - 1);
      for (const owner of rerenders.get(node) ?? []) settle.committed(owner, false, false);
      return true;
    },
    flush: (run): boolean => run(),
    queue: (task): void => {
      tasks.push(task);
    },
  });
  return {
    settle,
    measured,
    drain: (): void => {
      for (let task = tasks.shift(); task !== undefined; task = tasks.shift()) task();
    },
  };
}

describe('the layout settle after a screen resumes', () => {
  it('does nothing when the resumed nodes kept their layout', () => {
    const { settle, measured, drain } = scene(new Map(), new Map());
    settle.committed('card', true, false);
    settle.committed('sidebar', false, false);
    drain();
    expect(measured).toEqual([]);
  });

  it('measures only the resumed nodes and the ones their handlers re-rendered', () => {
    const { settle, measured, drain } = scene(
      new Map([['graph', 1]]),
      new Map([['graph', ['ticker']]]),
    );
    settle.committed('sidebar', false, false);
    settle.committed('graph', true, true);
    settle.committed('figures', true, false);
    drain();
    expect(measured).toEqual(['graph', 'figures', 'ticker']);
    settle.committed('sidebar', false, false);
    drain();
    expect(measured).toEqual(['graph', 'figures', 'ticker']);
  });

  it('stops once a pass delivers nothing new', () => {
    const { settle, measured, drain } = scene(
      new Map([
        ['graph', 1],
        ['ticker', 1],
      ]),
      new Map([
        ['graph', ['ticker']],
        ['ticker', ['band']],
      ]),
    );
    settle.committed('graph', true, true);
    drain();
    expect(measured).toEqual(['graph', 'ticker', 'band']);
  });

  it('skips a node that unmounted before the settle ran', () => {
    const { settle, measured, drain } = scene(new Map(), new Map());
    settle.committed('graph', true, true);
    settle.committed('gone', true, false);
    settle.forget('gone');
    drain();
    expect(measured).toEqual(['graph']);
  });
});
