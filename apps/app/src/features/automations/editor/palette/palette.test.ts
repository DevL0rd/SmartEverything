import { describe, expect, it } from 'vitest';
import {
  ALL_NODE_KINDS,
  NODE_KIND_ID,
  type AutomationFunctionSummary,
  type FlowType,
} from '@smarteverything/domain';
import {
  NEW_REUSABLE_KEY,
  functionEntry,
  nodeEntry,
  paletteGroups,
  shippedNodeEntries,
  takesText,
  type PaletteEntry,
  type PaletteEnv,
} from './palette-categories';
import { overviewOf } from './palette-overview';
import {
  LOOP_REASON,
  NO_USAGE,
  STEP_CONTEXT,
  TRIGGER_REASON,
  rankEntries,
  type PaletteContext,
} from './palette-search';
import { NEW_REUSABLE_ENTRY } from './palette-categories';
import { presetEntries } from './presets';
import { MAX_SUGGESTIONS, suggestedEntries } from './suggestions';

const OWNER: PaletteEnv = { isOwner: true, hasComputer: true };
const MEMBER: PaletteEnv = { isOwner: false, hasComputer: false };

const NUMBER: FlowType = { t: 'number' };

const FUNCTION: AutomationFunctionSummary = {
  id: 'fn-1',
  name: 'Dim the lights',
  description: null,
  category: 'lights',
  icon: null,
  builtin: false,
  editable: true,
  revision: 1,
  interface: {
    flavour: 'action',
    inputs: [
      { name: 'lights', type: { t: 'list', of: { t: 'ref', of: 'device' } }, required: true },
      { name: 'step', type: NUMBER, required: true },
    ],
    outputs: [{ name: 'level', type: NUMBER }],
    exits: ['done'],
  },
  interfaceHash: 'h',
  users: 2,
  createdBy: null,
  updatedAt: null,
};

function everything(env: PaletteEnv): readonly PaletteEntry[] {
  return [
    ...shippedNodeEntries(ALL_NODE_KINDS, env),
    ...presetEntries(),
    functionEntry(FUNCTION),
    NEW_REUSABLE_ENTRY,
  ];
}

function names(entries: readonly { readonly entry: PaletteEntry }[]): string[] {
  return entries.map(({ entry }) => entry.name);
}

function find(entries: readonly PaletteEntry[], key: string): PaletteEntry {
  const found = entries.find((entry) => entry.key === key);
  if (found === undefined) throw new Error(`missing entry ${key}`);
  return found;
}

describe('palette entries', () => {
  it('states what a node takes in words, never bare types', () => {
    const entries = everything(OWNER);
    for (const entry of entries) {
      expect(entry.takes).toMatch(entry.key.startsWith('function:') ? /^in:/ : /^(Takes|Opens)/);
      expect(entry.takes).not.toMatch(/\{|"t"|undefined/);
    }
    expect(takesText([])).toBe('Takes nothing');
    expect(
      takesText([
        { type: { t: 'list', of: { t: 'any' } }, required: true },
        { type: { t: 'any' }, required: true },
        { type: { t: 'ref', of: 'device' }, required: true },
        { type: NUMBER, required: true },
        { type: NUMBER, required: false },
      ]),
    ).toBe('Takes a list, any value, a device and 1 more');
  });

  it('describes a Custom Node by its interface', () => {
    const entry = functionEntry(FUNCTION);
    expect(entry.takes).toBe('in: lights, step · out: level');
    expect(entry.section).toBe('reusable');
  });

  it('keeps every recordable id valid for the saved palette', () => {
    for (const entry of everything(OWNER)) {
      if (entry.usageId !== null) expect(NODE_KIND_ID.safeParse(entry.usageId).success).toBe(true);
    }
  });

  it('keys are unique', () => {
    const keys = everything(OWNER).map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('disables owner and computer rows with the reason', () => {
    const entries = everything(MEMBER);
    const reasons = entries.flatMap((entry) => (entry.disabled === null ? [] : [entry.disabled]));
    expect(reasons).toContain('Pair a computer first.');
    const ai = ALL_NODE_KINDS.find((kind) => kind.access === 'owner' && kind.tier === 'v1');
    if (ai !== undefined) expect(nodeEntry(ai, MEMBER).disabled).not.toBeNull();
    expect(everything(OWNER).filter((entry) => entry.disabled !== null)).toEqual([]);
  });
});

describe('palette groups', () => {
  it('starts Custom Nodes with New Custom Node and lists the rest by name', () => {
    const groups = paletteGroups(everything(OWNER));
    const reusable = groups.find((group) => group.id === 'reusable');
    expect(reusable?.entries[0]?.key).toBe(NEW_REUSABLE_KEY);
    expect(reusable?.entries.some((entry) => entry.name === 'Dim the lights')).toBe(true);
  });

  it('shows Custom Nodes even with no saved Custom Nodes', () => {
    const groups = paletteGroups([]);
    expect(groups.map((group) => group.id)).toEqual(['reusable']);
    expect(groups[0]?.entries.map((entry) => entry.key)).toEqual([NEW_REUSABLE_KEY]);
  });

  it('puts device presets under Devices', () => {
    const groups = paletteGroups(everything(OWNER));
    const devices = groups.find((group) => group.id === 'devices');
    expect(devices?.entries.some((entry) => entry.key === 'preset:device.set.brightness')).toBe(
      true,
    );
  });
});

describe('palette search', () => {
  const entries = everything(OWNER);

  it('puts a name match before a keyword match', () => {
    const ranked = rankEntries(entries, 'wait', STEP_CONTEXT);
    expect(ranked[0]?.entry.name.toLowerCase()).toContain('wait');
    expect(ranked.length).toBeGreaterThan(1);
  });

  it('requires every word to match', () => {
    const all = rankEntries(entries, 'dim lights', STEP_CONTEXT);
    expect(names(all)).toContain('Dim the lights');
    expect(rankEntries(entries, 'dim zzzzqqq', STEP_CONTEXT)).toEqual([]);
  });

  it('matches port types in words', () => {
    const byList = rankEntries(entries, 'list', STEP_CONTEXT);
    expect(byList.length).toBeGreaterThan(0);
    expect(names(rankEntries(entries, 'on/off', STEP_CONTEXT)).length).toBeGreaterThan(0);
  });

  it('matches the category name', () => {
    const ranked = rankEntries(entries, 'notify', STEP_CONTEXT);
    expect(ranked.some(({ entry }) => entry.section === 'notify')).toBe(true);
  });

  it('lists everything with no query, enabled rows before disabled ones', () => {
    const ranked = rankEntries(everything(MEMBER), '', STEP_CONTEXT);
    const firstDisabled = ranked.findIndex(({ reason }) => reason !== null);
    expect(firstDisabled).toBeGreaterThan(0);
    expect(ranked.slice(firstDisabled).every(({ reason }) => reason !== null)).toBe(true);
  });

  it('ranks favourites and recents higher', () => {
    const base = rankEntries(entries, 'device', STEP_CONTEXT, NO_USAGE);
    const last = base
      .filter(({ reason, entry }) => reason === null && entry.usageId !== null)
      .at(-1)?.entry;
    expect(last?.usageId).toBeDefined();
    const pinned = rankEntries(entries, 'device', STEP_CONTEXT, {
      recents: [],
      favourites: last?.usageId === null || last === undefined ? [] : [last.usageId],
    });
    const before = base.findIndex(({ entry }) => entry.key === last?.key);
    const after = pinned.findIndex(({ entry }) => entry.key === last?.key);
    expect(after).toBeLessThan(before);
  });

  it('keeps triggers disabled with a reason outside the trigger slot and hides the rest in it', () => {
    const step = rankEntries(entries, '', STEP_CONTEXT);
    const trigger = step.find(({ entry }) => entry.trigger);
    expect(trigger?.reason).toBe(TRIGGER_REASON);
    const slot: PaletteContext = { ...STEP_CONTEXT, slot: 'trigger' };
    const only = rankEntries(entries, '', slot);
    expect(only.length).toBeGreaterThan(0);
    expect(only.every(({ entry, reason }) => entry.trigger && reason === null)).toBe(true);
  });

  it('disables Break outside a loop and enables it inside', () => {
    const outside = rankEntries(entries, 'break', STEP_CONTEXT);
    expect(outside.find(({ entry }) => entry.kindId === 'flow.break')?.reason).toBe(LOOP_REASON);
    const inside = rankEntries(entries, 'break', { ...STEP_CONTEXT, inLoop: true });
    expect(inside.find(({ entry }) => entry.kindId === 'flow.break')?.reason).toBeNull();
  });

  it('ranks nodes that give the expected type first at a value port', () => {
    const context: PaletteContext = { ...STEP_CONTEXT, slot: 'value', expected: NUMBER };
    const ranked = rankEntries(entries, '', context);
    const top = ranked[0]?.entry;
    expect(top?.gives.some((type) => type.t === 'number')).toBe(true);
    const noValue = ranked.findIndex(({ entry }) => entry.gives.length === 0);
    const fits = ranked.findIndex(({ entry }) => entry.gives.some((type) => type.t === 'number'));
    expect(fits).toBeLessThan(noValue);
  });
});

describe('suggestions', () => {
  const entries = everything(OWNER);

  it('suggests Only continue if and Change device after a trigger', () => {
    const picked = suggestedEntries(entries, { ...STEP_CONTEXT, afterTrigger: true });
    expect(picked.map((entry) => entry.key)).toEqual(['node:flow.guard', 'node:device.set']);
  });

  it('suggests Break and Next item inside a loop', () => {
    const picked = suggestedEntries(entries, { ...STEP_CONTEXT, inLoop: true });
    expect(picked.map((entry) => entry.kindId)).toEqual(['flow.break', 'flow.continue']);
  });

  it('suggests nodes that give the type at a value port, at most six', () => {
    const picked = suggestedEntries(entries, { ...STEP_CONTEXT, slot: 'value', expected: NUMBER });
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
    expect(picked.every((entry) => entry.gives.some((type) => type.t === 'number'))).toBe(true);
  });

  it('puts favourites and recents after the contextual ones without repeats', () => {
    const usage = { recents: ['flow.guard', 'flow.wait'], favourites: ['device.set'] };
    const picked = suggestedEntries(entries, { ...STEP_CONTEXT, afterTrigger: true }, usage);
    expect(picked.map((entry) => entry.key)).toEqual([
      'node:flow.guard',
      'node:device.set',
      'node:flow.wait',
    ]);
  });

  it('never suggests a disabled row', () => {
    const picked = suggestedEntries(entries, STEP_CONTEXT, {
      recents: ['flow.break'],
      favourites: [],
    });
    expect(picked.map((entry) => entry.kindId)).not.toContain('flow.break');
  });
});

describe('overview', () => {
  it('drops empty categories in the trigger slot and keeps counts of what is shown', () => {
    const entries = everything(OWNER);
    const groups = paletteGroups(entries);
    const slot: PaletteContext = { ...STEP_CONTEXT, slot: 'trigger' };
    const overview = overviewOf(entries, groups, slot, NO_USAGE);
    expect(overview.groups.map((group) => group.id)).toEqual(['triggers']);
    expect(find(entries, NEW_REUSABLE_KEY).trigger).toBe(false);
  });
});
