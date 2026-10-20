import type { AutomationsBreakpointsPref } from '@smarteverything/domain';
import {
  MAX_BREAKPOINT_AUTOMATIONS,
  MAX_BREAKPOINTS_PER_AUTOMATION,
} from '@smarteverything/domain';
import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  BreakpointModel,
  NO_BREAKPOINTS,
  breakpointsOf,
  clearBreakpoints,
  hasBreakpoint,
  pruneBreakpoints,
  toggleBreakpoint,
} from './breakpoints';
import { uuid } from './editor-fixtures';

const AUTOMATION = uuid();
const OTHER = uuid();

function port(initial: AutomationsBreakpointsPref = NO_BREAKPOINTS): {
  load: Mock<() => Promise<AutomationsBreakpointsPref>>;
  save: Mock<(pref: AutomationsBreakpointsPref) => Promise<void>>;
} {
  return {
    load: vi.fn(() => Promise.resolve(initial)),
    save: vi.fn((_pref: AutomationsBreakpointsPref) => Promise.resolve()),
  };
}

describe('breakpoint list', () => {
  it('toggles a node on and off and drops an empty list', () => {
    const node = uuid();
    const on = toggleBreakpoint(NO_BREAKPOINTS, AUTOMATION, node);
    expect(breakpointsOf(on, AUTOMATION)).toEqual([node]);
    expect(hasBreakpoint(on, AUTOMATION, node)).toBe(true);
    expect(hasBreakpoint(on, OTHER, node)).toBe(false);
    expect(toggleBreakpoint(on, AUTOMATION, node)).toEqual(NO_BREAKPOINTS);
  });

  it('keeps the newest breakpoints when a list is full', () => {
    const nodes = Array.from({ length: MAX_BREAKPOINTS_PER_AUTOMATION + 1 }, () => uuid());
    const pref = nodes.reduce((all, id) => toggleBreakpoint(all, AUTOMATION, id), NO_BREAKPOINTS);
    expect(breakpointsOf(pref, AUTOMATION)).toEqual(nodes.slice(1));
  });

  it('forgets the least recently changed automation beyond the limit', () => {
    const automations = Array.from({ length: MAX_BREAKPOINT_AUTOMATIONS + 1 }, () => uuid());
    const node = uuid();
    const pref = automations.reduce((all, id) => toggleBreakpoint(all, id, node), NO_BREAKPOINTS);
    expect(Object.keys(pref.byAutomation)).toHaveLength(MAX_BREAKPOINT_AUTOMATIONS);
    expect(breakpointsOf(pref, automations[0] ?? '')).toEqual([]);
    expect(breakpointsOf(pref, automations.at(-1) ?? '')).toEqual([node]);
  });

  it('clears one automation and leaves the rest', () => {
    const node = uuid();
    const both = toggleBreakpoint(toggleBreakpoint(NO_BREAKPOINTS, AUTOMATION, node), OTHER, node);
    expect(clearBreakpoints(both, AUTOMATION)).toEqual({ byAutomation: { [OTHER]: [node] } });
    expect(clearBreakpoints(both, uuid())).toBe(both);
  });

  it('prunes nodes that no longer exist', () => {
    const keep = uuid();
    const gone = uuid();
    const pref = toggleBreakpoint(
      toggleBreakpoint(NO_BREAKPOINTS, AUTOMATION, keep),
      AUTOMATION,
      gone,
    );
    expect(pruneBreakpoints(pref, AUTOMATION, new Set([keep, gone]))).toBe(pref);
    expect(pruneBreakpoints(pref, AUTOMATION, new Set([keep]))).toEqual({
      byAutomation: { [AUTOMATION]: [keep] },
    });
    expect(pruneBreakpoints(pref, AUTOMATION, new Set())).toEqual(NO_BREAKPOINTS);
    expect(pruneBreakpoints(pref, OTHER, new Set())).toBe(pref);
  });
});

describe('breakpoint model', () => {
  it('loads what the port holds', async () => {
    const node = uuid();
    const stored = { byAutomation: { [AUTOMATION]: [node] } };
    const model = new BreakpointModel(port(stored));
    expect(model.state.get().loaded).toBe(false);
    await model.load();
    expect(model.state.get()).toEqual({ pref: stored, loaded: true, saveFailed: false });
  });

  it('saves every change in order through the port', async () => {
    const io = port();
    const model = new BreakpointModel(io);
    const first = uuid();
    const second = uuid();
    model.toggle(AUTOMATION, first);
    model.toggle(AUTOMATION, second);
    await model.settled();
    expect(io.save).toHaveBeenCalledTimes(2);
    expect(io.save.mock.calls[0]?.[0].byAutomation[AUTOMATION]).toEqual([first, second]);
    model.clear(AUTOMATION);
    await model.settled();
    expect(io.save).toHaveBeenLastCalledWith(NO_BREAKPOINTS);
  });

  it('does not save when nothing changed', async () => {
    const io = port();
    const model = new BreakpointModel(io);
    model.clear(AUTOMATION);
    model.prune(AUTOMATION, new Set());
    await model.settled();
    expect(io.save).not.toHaveBeenCalled();
  });

  it('prunes through the port', async () => {
    const io = port();
    const model = new BreakpointModel(io);
    const node = uuid();
    model.toggle(AUTOMATION, node);
    model.prune(AUTOMATION, new Set());
    await model.settled();
    expect(model.state.get().pref).toEqual(NO_BREAKPOINTS);
    expect(io.save).toHaveBeenCalledTimes(2);
  });

  it('reports a failed save and recovers on the next one', async () => {
    const io = port();
    io.save.mockRejectedValueOnce(new Error('offline'));
    const model = new BreakpointModel(io);
    model.toggle(AUTOMATION, uuid());
    await model.settled();
    expect(model.state.get().saveFailed).toBe(true);
    model.toggle(AUTOMATION, uuid());
    await model.settled();
    expect(model.state.get().saveFailed).toBe(false);
  });
});
