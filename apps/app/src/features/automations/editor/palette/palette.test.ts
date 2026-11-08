import { describe, expect, it } from 'vitest';
import {
  ALL_NODE_KINDS,
  NODE_KIND_ID,
  type AutomationFunctionSummary,
  type FlowType,
  type NodeKind,
} from '@smarteverything/domain';
import {
  NEW_REUSABLE_KEY,
  fromText,
  functionEntry,
  paletteGroups,
  shippedNodeEntries,
  takesText,
  type PaletteEntry,
  type PaletteOrigin,
} from './palette-categories';
import { openGroup, overviewOf } from './palette-overview';
import { NO_USAGE, STEP_CONTEXT, rankEntries, type PaletteContext } from './palette-search';
import { NEW_REUSABLE_ENTRY } from './palette-categories';
import { presetEntries } from './presets';
import { MAX_SUGGESTIONS, suggestedEntries } from './suggestions';

const NUMBER: FlowType = { t: 'number' };

const FUNCTION: AutomationFunctionSummary = {
  id: 'fn-1',
  name: 'Dim the lights',
  description: null,
  category: 'lights',
  icon: null,
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

function everything(): readonly PaletteEntry[] {
  return [
    ...shippedNodeEntries(ALL_NODE_KINDS),
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
    const entries = everything();
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
    for (const entry of everything()) {
      if (entry.usageId !== null) expect(NODE_KIND_ID.safeParse(entry.usageId).success).toBe(true);
    }
  });

  it('keys are unique', () => {
    const keys = everything().map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('palette groups', () => {
  it('starts Custom Nodes with New Custom Node and lists the rest by name', () => {
    const groups = paletteGroups(everything());
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
    const groups = paletteGroups(everything());
    const devices = groups.find((group) => group.id === 'devices');
    expect(devices?.entries.some((entry) => entry.key === 'preset:device.set.brightness')).toBe(
      true,
    );
  });
});

describe('light presets', () => {
  it('puts the light.set presets under Devices', () => {
    const groups = paletteGroups(everything());
    const devices = groups.find((group) => group.id === 'devices');
    const warm = devices?.entries.find((entry) => entry.key === 'preset:light.set.warm_white');
    expect(warm?.kindId).toBe('light.set');
    expect(warm?.choice).toMatchObject({
      source: 'kind-preset',
      ports: { colorTemperature: 2700 },
    });
  });
});

describe('palette search', () => {
  const entries = everything();

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

  it('ranks favourites and recents higher', () => {
    const base = rankEntries(entries, 'device', STEP_CONTEXT, NO_USAGE);
    const last = base.filter(({ entry }) => entry.usageId !== null).at(-1)?.entry;
    expect(last?.usageId).toBeDefined();
    const pinned = rankEntries(entries, 'device', STEP_CONTEXT, {
      recents: [],
      favourites: last?.usageId === null || last === undefined ? [] : [last.usageId],
    });
    const before = base.findIndex(({ entry }) => entry.key === last?.key);
    const after = pinned.findIndex(({ entry }) => entry.key === last?.key);
    expect(after).toBeLessThan(before);
  });

  it('offers every entry, triggers included, in the step slot', () => {
    const step = rankEntries(entries, '', STEP_CONTEXT);
    expect(step.map(({ entry }) => entry.key)).toEqual(
      expect.arrayContaining(entries.map((entry) => entry.key)),
    );
    expect(step.some(({ entry }) => entry.trigger)).toBe(true);
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
  const entries = everything();

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
});

describe('overview', () => {
  it('drops empty categories in the trigger slot and keeps counts of what is shown', () => {
    const entries = everything();
    const groups = paletteGroups(entries);
    const slot: PaletteContext = { ...STEP_CONTEXT, slot: 'trigger' };
    const overview = overviewOf(entries, groups, slot, NO_USAGE);
    expect(overview.groups.map((group) => group.id)).toEqual(['triggers']);
    expect(find(entries, NEW_REUSABLE_KEY).trigger).toBe(false);
  });
});

function pluginKind(id: string, name: string, owner: PaletteOrigin): NodeKind {
  const base = ALL_NODE_KINDS.find((kind) => kind.id === 'notify.person');
  if (base === undefined) throw new Error('missing notify.person');
  return {
    ...base,
    id,
    name,
    category: 'plugins',
    keywords: [],
    origin: { kind: 'plugin', id: owner.id, name: owner.name, icon: 'messageCircle', version: '1' },
  };
}

const DISCORD = { id: 'discord', name: 'Discord', icon: 'messageCircle' };
const SHELLY = { id: 'shelly-presence', name: 'Shelly presence', icon: 'messageCircle' };

function pluginEntries(): readonly PaletteEntry[] {
  return shippedNodeEntries([
    pluginKind('plugin.discord.send', 'Send a Discord message', DISCORD),
    pluginKind('plugin.discord.ask', 'Ask on Discord', DISCORD),
    pluginKind('plugin.shelly_presence.zone', 'Zone presence', SHELLY),
  ]);
}

describe('plugin groups', () => {
  it('groups plugin kinds by the plugin that adds them, sorted by plugin name', () => {
    const groups = paletteGroups(pluginEntries()).filter((group) => group.id === 'plugins');
    expect(groups.map((group) => [group.key, group.name])).toEqual([
      ['plugins:discord', 'Discord'],
      ['plugins:shelly-presence', 'Shelly presence'],
    ]);
    expect(groups[0]?.entries.map((entry) => entry.name)).toEqual([
      'Ask on Discord',
      'Send a Discord message',
    ]);
  });

  it('shows the plugin icon on its group and the section icon on core groups', () => {
    const groups = paletteGroups([...pluginEntries(), ...everything()]);
    expect(groups.find((group) => group.key === 'plugins:discord')?.icon).toBe('messageCircle');
    expect(groups.find((group) => group.key === 'devices')?.icon).toBe('plug');
  });

  it('opens each plugin group with only its own plugin nodes', () => {
    const groups = paletteGroups([...pluginEntries(), ...everything()]);
    expect(
      openGroup(groups, 'plugins:shelly-presence')?.entries.map((entry) => entry.name),
    ).toEqual(['Zone presence']);
    expect(openGroup(groups, 'plugins:discord')?.entries.map((entry) => entry.name)).toEqual([
      'Ask on Discord',
      'Send a Discord message',
    ]);
  });

  it('keeps every group key unique', () => {
    const keys = paletteGroups([...pluginEntries(), ...everything()]).map((group) => group.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('finds plugin kinds by the plugin name and says where a hit comes from', () => {
    const hits = rankEntries(pluginEntries(), 'discord', STEP_CONTEXT);
    expect(names(hits)).toEqual(['Ask on Discord', 'Send a Discord message']);
    const shelly = rankEntries(pluginEntries(), 'shelly', STEP_CONTEXT)[0]?.entry;
    expect(shelly?.takes.startsWith(fromText(SHELLY, ''))).toBe(true);
  });

  it('leaves core rows without a plugin name', () => {
    const entries = everything();
    expect(entries.every((entry) => entry.origin === undefined)).toBe(true);
    expect(entries.some((entry) => entry.takes.startsWith('From '))).toBe(false);
  });
});
