import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerfProbe, counted, timed } from '../perf/probe-kit';
import { probedScreen } from '../perf/screen-probe';
import { attachSession, detachSession, type PerfSink } from '../perf/sink';
import { activateFlags, readDeveloperFlags } from './flags';
import { DEVELOPER_TOGGLES, allOff, resolveFlags, withLogLevel } from './toggles';

const RECORDED: string[] = [];

function flagged(flags: Readonly<Record<string, boolean>>): readonly string[] {
  return Object.entries(flags)
    .filter(([, on]) => on)
    .map(([id]) => id);
}

function probes(id: string): ReactNode {
  return PerfProbe({ id, children: createElement('i', null, id) });
}

function tagOf(element: ReactNode): string {
  return typeof element === 'object' && element !== null && 'type' in element ? 'wrapped' : 'bare';
}

function sink(): PerfSink {
  return {
    record: (id: string): void => {
      RECORDED.push(id);
    },
    screenCommit: () => undefined,
    screenMount: () => undefined,
    screenUnmount: () => undefined,
    action: () => undefined,
    screen: () => undefined,
    store: () => undefined,
    touch: () => undefined,
    listRows: () => undefined,
    listCell: () => undefined,
    listGone: () => undefined,
    listViewport: () => undefined,
    listContent: () => undefined,
    listScroll: () => undefined,
  };
}

beforeEach(() => {
  vi.stubGlobal('__DEV__', false);
  RECORDED.length = 0;
  detachSession();
  activateFlags(allOff());
});

afterEach(() => {
  detachSession();
  vi.unstubAllGlobals();
});

describe('developer toggles', () => {
  it('has unique ids and parents that come first', () => {
    const seen = new Set<string>();
    DEVELOPER_TOGGLES.forEach((toggle) => {
      expect(seen.has(toggle.id)).toBe(false);
      if (toggle.parent !== null) {
        expect(seen.has(toggle.parent)).toBe(true);
      }
      seen.add(toggle.id);
    });
  });

  it('turns on only the initial toggles with nothing stored', () => {
    const flags = resolveFlags({}, true);
    DEVELOPER_TOGGLES.forEach((toggle) => {
      expect(flags[toggle.id]).toBe(toggle.initial === true && toggle.parent === null);
    });
    const sampling = resolveFlags({ 'perf.sampling': true }, true);
    expect(sampling['perf.fanout']).toBe(true);
    expect(sampling['perf.nav']).toBe(true);
    expect(flags['perf.frames']).toBe(true);
    expect(Object.values(allOff()).some(Boolean)).toBe(false);
  });

  it('keeps an initial toggle off once it was switched off', () => {
    expect(resolveFlags({ 'perf.frames': false }, true)['perf.frames']).toBe(false);
  });

  it('keeps a stored option off while its parent is off', () => {
    const flags = resolveFlags({ 'perf.stalls': true }, true);
    expect(flags['perf.stalls']).toBe(false);
    expect(resolveFlags({ 'perf.sampling': true, 'perf.stalls': true }, true)['perf.stalls']).toBe(
      true,
    );
  });

  it('turns everything off while developer mode is off, whatever is stored', () => {
    const all = Object.fromEntries(DEVELOPER_TOGGLES.map((toggle) => [toggle.id, true]));
    expect(flagged(resolveFlags(all, false))).toEqual([]);
  });

  it('keeps one log level on at a time', () => {
    expect(flagged(resolveFlags({}, true))).toEqual(['perf.frames', 'log.level.info']);
    expect(flagged(resolveFlags(withLogLevel({}, 'trace'), true))).toEqual([
      'perf.frames',
      'log.level.trace',
    ]);
  });

  it('requires an explicit opt-in to save raw watch files', () => {
    expect(resolveFlags({}, true)['watch.capture']).toBe(false);
    expect(resolveFlags({ 'watch.capture': true }, true)['watch.capture']).toBe(true);
    expect(resolveFlags({ 'watch.capture': true }, false)['watch.capture']).toBe(false);
  });
});

describe('gating while off', () => {
  it('leaves a bare tree, a plain handler and a plain result untouched', () => {
    const chunk = createElement('i', null, 'x');
    expect(PerfProbe({ id: 'x', children: chunk })).toBe(chunk);
    const handler = (): void => undefined;
    expect(counted('id', handler)).toBe(handler);
    expect(timed('id', () => 7)).toBe(7);
    const screen = createElement('div');
    expect(probedScreen({ route: { name: 'a' }, children: screen })).toBe(screen);
  });

  it('returns the same handler and work result with a session while the option is off', () => {
    attachSession({ sink: sink(), stop: () => undefined });
    expect(readDeveloperFlags()['perf.profilers']).not.toBe(true);
    const handler = (): void => undefined;
    expect(counted('id', handler)).toBe(handler);
    expect(timed('id', () => 7)).toBe(7);
  });
});

describe('gating while on', () => {
  it('wraps children and handlers once the option is on', () => {
    attachSession({ sink: sink(), stop: () => undefined });
    activateFlags({ ...allOff(), 'perf.profilers': true });
    expect(readDeveloperFlags()['perf.profilers']).toBe(true);
    expect(tagOf(probes('x'))).toBe('wrapped');
    const handler = (): void => undefined;
    expect(counted('id', handler)).not.toBe(handler);
  });

  it('records through the kit once a session is attached', () => {
    attachSession({ sink: sink(), stop: () => undefined });
    activateFlags({ ...allOff(), 'perf.profilers': true });
    counted('lay', () => undefined)();
    expect(timed('parse', () => 3)).toBe(3);
    expect(RECORDED).toEqual(['lay', 'parse']);
  });
});
