import { randomUUID } from 'node:crypto';
import {
  DRIVE_MATCHER_MAPPINGS,
  DRIVE_SIGNAL,
  DRIVE_SIGNALS,
  NODE_REGISTRY,
  compileTriggerMatcher,
  signalMatchesMatcher as signalMatches,
  signalTriggerError,
  type DriveChange,
  type DriveChangeResult,
  type SignalInput,
  type SignalMatcher,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { describe, expect, it } from 'vitest';
import { withExecutionAuthority } from '../../src/assistant/turn-authority';
import { driveEffects, type DriveEffectPorts } from '../../src/automations/effects/drive-nodes';
import type { DriveCaller } from '../../src/drive/service-write-support';
import type { ConversationAuthority } from '../../src/harness/authority-contract';
import { testRun } from '../automations-v3/effects/support';

const AT = '2026-11-07T08:00:00.000Z';
const ROOT = randomUUID();
const FOLDER = randomUUID();
const ITEM = randomUUID();
const OWNER = randomUUID();
const MEMBER = randomUUID();

const TRIGGERS = ['trigger.drive_item_added', 'trigger.drive_conflict', 'trigger.drive_integrity'];
const ACTIONS = ['drive.add_to_album', 'drive.keep'];

const ADDED_DATA = {
  itemId: ITEM,
  rootId: ROOT,
  folderId: FOLDER,
  name: 'beach.jpg',
  relPath: 'Trips/beach.jpg',
  kind: 'image',
  via: 'sync',
  addedByProfileId: OWNER,
} as const;

function signalOf(kind: string, data: Readonly<Record<string, unknown>>): SignalInput {
  return DRIVE_SIGNAL.parse({
    source: 'drive',
    kind,
    subject: null,
    field: null,
    value: true,
    previous: null,
    at: AT,
    profileId: null,
    data,
  });
}

function matcherOf(id: string, ports: Parameters<typeof compileTriggerMatcher>[1]): SignalMatcher {
  const compiled = compileTriggerMatcher(id, ports, DRIVE_MATCHER_MAPPINGS[id]);
  if (!compiled.ok) throw new Error(compiled.error);
  return compiled.matcher;
}

function kindOf(id: string): NonNullable<ReturnType<typeof NODE_REGISTRY.get>> {
  const found = NODE_REGISTRY.get(id);
  if (found === undefined) throw new Error(`no kind ${id}`);
  return found;
}

describe('drive node kinds', () => {
  it('are registered once, shipped for members, with triggers named like every trigger', () => {
    for (const id of [...TRIGGERS, ...ACTIONS]) {
      const found = kindOf(id);
      expect(found.access).toBe('member');
      expect(NODE_REGISTRY.shipped().some((each) => each.id === id)).toBe(true);
    }
    for (const id of TRIGGERS) expect(kindOf(id).class).toBe('trigger');
    for (const id of ACTIONS) expect(kindOf(id).class).toBe('effect');
    const ids = NODE_REGISTRY.kinds.map((each) => each.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declare every trigger output the matcher mapping fills', () => {
    for (const id of TRIGGERS) {
      const declared = kindOf(id).outputs.map((port) => port.name);
      const filled = Object.keys(DRIVE_MATCHER_MAPPINGS[id]?.outputs ?? {});
      expect(filled.length).toBeGreaterThan(0);
      for (const name of filled) expect(declared).toContain(name);
    }
  });

  it('declare an input for every match port of the mappings', () => {
    for (const id of TRIGGERS) {
      const inputs = kindOf(id).inputs.map((port) => port.name);
      for (const port of Object.keys(DRIVE_MATCHER_MAPPINGS[id]?.matchPorts ?? {})) {
        expect(inputs).toContain(port);
      }
    }
  });

  it('fill outputs only from keys the signal data carries', () => {
    const samples = new Map<string, Readonly<Record<string, unknown>>>([
      ['trigger.drive_item_added', ADDED_DATA],
      ['trigger.drive_conflict', conflictData()],
      ['trigger.drive_integrity', integrityData()],
    ]);
    for (const id of TRIGGERS) {
      const data = samples.get(id) ?? {};
      for (const from of Object.values(DRIVE_MATCHER_MAPPINGS[id]?.outputs ?? {})) {
        expect(Object.keys(data)).toContain(from);
      }
    }
  });
});

function conflictData(): Readonly<Record<string, string>> {
  return {
    conflictId: randomUUID(),
    rootId: ROOT,
    itemId: ITEM,
    conflictItemId: randomUUID(),
    relPath: 'Docs/plan.txt',
    conflictRelPath: 'Docs/plan (conflict).txt',
    deviceId: randomUUID(),
  };
}

function integrityData(): Readonly<Record<string, string>> {
  return { rootId: ROOT, itemId: ITEM, relPath: 'Docs/plan.txt' };
}

describe('drive triggers', () => {
  it('match every new item without narrowing and respect root, folder and kind', () => {
    const added = signalOf('item_added', ADDED_DATA);
    expect(signalMatches(matcherOf('trigger.drive_item_added', {}), added)).toBe(true);
    expect(signalMatches(matcherOf('trigger.drive_item_added', { root: ROOT }), added)).toBe(true);
    expect(
      signalMatches(matcherOf('trigger.drive_item_added', { root: randomUUID() }), added),
    ).toBe(false);
    expect(signalMatches(matcherOf('trigger.drive_item_added', { folder: FOLDER }), added)).toBe(
      true,
    );
    expect(
      signalMatches(matcherOf('trigger.drive_item_added', { folder: randomUUID() }), added),
    ).toBe(false);
    expect(signalMatches(matcherOf('trigger.drive_item_added', { kind: 'image' }), added)).toBe(
      true,
    );
    expect(signalMatches(matcherOf('trigger.drive_item_added', { kind: 'video' }), added)).toBe(
      false,
    );
    expect(
      signalMatches(
        matcherOf('trigger.drive_item_added', { root: ROOT, folder: FOLDER, kind: 'image' }),
        added,
      ),
    ).toBe(true);
  });

  it('match conflicts and integrity failures of a root and no other signal', () => {
    const conflict = signalOf('conflict', conflictData());
    const integrity = signalOf('integrity_failed', integrityData());
    expect(signalMatches(matcherOf('trigger.drive_conflict', { root: ROOT }), conflict)).toBe(true);
    expect(
      signalMatches(matcherOf('trigger.drive_conflict', { root: randomUUID() }), conflict),
    ).toBe(false);
    expect(signalMatches(matcherOf('trigger.drive_conflict', {}), integrity)).toBe(false);
    expect(signalMatches(matcherOf('trigger.drive_integrity', {}), integrity)).toBe(true);
    expect(signalMatches(matcherOf('trigger.drive_integrity', { root: ROOT }), conflict)).toBe(
      false,
    );
  });

  it('refuse a signal that does not carry the declared data', () => {
    expect(() => signalOf('item_added', { ...ADDED_DATA, kind: 'spreadsheet' })).toThrow();
    expect(() => signalOf('conflict', { rootId: ROOT })).toThrow();
    expect(() => signalOf('integrity_failed', { ...integrityData(), extra: 1 })).toThrow();
  });

  it('are registered signals whose match keys are exactly what the triggers narrow by', () => {
    for (const id of TRIGGERS) {
      const mapping = DRIVE_MATCHER_MAPPINGS[id];
      const variant = mapping?.variants[''];
      if (mapping === undefined || variant === undefined) throw new Error(`no mapping ${id}`);
      const keys = Object.values(mapping.matchPorts);
      const spec = DRIVE_SIGNALS.kinds.find((each) => each.kind === variant.kind);
      expect(spec?.match.map((entry) => entry.key).sort()).toEqual([...keys].sort());
      const source = variant.source ?? '';
      expect(
        signalTriggerError([DRIVE_SIGNALS], {
          source,
          kind: variant.kind ?? '',
          match: Object.fromEntries(
            keys.map((key) => [key, spec?.match.find((m) => m.key === key)?.values?.[0] ?? ROOT]),
          ),
        }),
      ).toBeNull();
    }
  });
});

interface Rig {
  readonly calls: { readonly caller: DriveCaller; readonly change: DriveChange }[];
  readonly run: (
    kind: string,
    params: EffectRequest['params'],
    authority?: ConversationAuthority,
  ) => Promise<NodeResult>;
}

function request(kind: string, params: EffectRequest['params']): EffectRequest {
  return {
    kind,
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: 'n',
    params,
    retry: 'relative',
    budget: 'effects',
  };
}

function authority(profileId: string, role: 'owner' | 'member'): ConversationAuthority {
  return {
    event_id: randomUUID(),
    profile_id: profileId,
    client_id: null,
    kind: 'service',
    role,
    hub_os_ban: false,
    tools: null,
    plugin_id: null,
    requester: null,
  };
}

function rigOf(result: (change: DriveChange) => DriveChangeResult): Rig {
  const calls: Rig['calls'] = [];
  const ports: DriveEffectPorts = {
    ownerProfileId: () => OWNER,
    drive: {
      change: (caller, change) => {
        calls.push({ caller, change });
        return Promise.resolve(result(change));
      },
    },
  };
  const handlers = driveEffects(ports);
  return {
    calls,
    run: (kind, params, who): Promise<NodeResult> => {
      const handler = handlers[kind];
      if (handler === undefined) throw new Error(`no handler ${kind}`);
      const call = (): Promise<NodeResult> => handler(params, request(kind, params), testRun());
      return who === undefined ? call() : withExecutionAuthority(who, call);
    },
  };
}

const DONE = (itemId: string, resultItemId: string | null): DriveChangeResult => ({
  done: [{ itemId, resultItemId }],
  failed: [],
  conflicts: [],
});

function failureMessage(result: NodeResult): string {
  return result.ok ? '' : result.message;
}

describe('drive.add_to_album', () => {
  it('adds the item to the album as the owner with the automation as the way in', async () => {
    const album = randomUUID();
    const rig = rigOf(() => DONE(ITEM, null));
    const result = await rig.run('drive.add_to_album', { item: ITEM, album });
    expect(result).toEqual({ ok: true, value: { ok: true } });
    expect(rig.calls).toEqual([
      {
        caller: { profileId: OWNER, owner: true, via: 'automation', deviceId: null },
        change: { action: 'album_add', albumId: album, itemIds: [ITEM] },
      },
    ]);
  });

  it('acts as the member whose automation runs it, never as the owner', async () => {
    const rig = rigOf(() => DONE(ITEM, null));
    await rig.run(
      'drive.add_to_album',
      { item: ITEM, album: randomUUID() },
      authority(MEMBER, 'member'),
    );
    expect(rig.calls[0]?.caller).toEqual({
      profileId: MEMBER,
      owner: false,
      via: 'automation',
      deviceId: null,
    });
  });

  it('fails with the hub reason when the item or album is refused', async () => {
    const rig = rigOf(() => ({
      done: [],
      failed: [{ itemId: ITEM, reason: 'That album is not yours to change.' }],
      conflicts: [],
    }));
    const result = await rig.run('drive.add_to_album', { item: ITEM, album: randomUUID() });
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(failureMessage(result)).toContain('That album is not yours to change.');
  });

  it('refuses ids that are not ids before asking the hub', async () => {
    const rig = rigOf(() => DONE(ITEM, null));
    const result = await rig.run('drive.add_to_album', { item: 'beach', album: randomUUID() });
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(rig.calls).toEqual([]);
  });
});

describe('drive.keep', () => {
  it('copies the item into the folder and returns the id of the copy', async () => {
    const copy = randomUUID();
    const rig = rigOf(() => DONE(ITEM, copy));
    const result = await rig.run('drive.keep', { item: ITEM, folder: FOLDER });
    expect(result).toEqual({ ok: true, value: { itemId: copy } });
    expect(rig.calls[0]?.change).toEqual({
      action: 'keep_source_item',
      itemId: ITEM,
      toFolderId: FOLDER,
    });
  });

  it('fails when the folder already holds an item of that name', async () => {
    const rig = rigOf(() => ({
      done: [],
      failed: [],
      conflicts: [{ itemId: ITEM, name: 'clip.mp4', existingItemId: randomUUID() }],
    }));
    const result = await rig.run('drive.keep', { item: ITEM, folder: FOLDER });
    expect(result).toMatchObject({ ok: false, class: 'Failed', code: 'conflict' });
    expect(failureMessage(result)).toContain('clip.mp4 already exists in that folder.');
  });

  it('fails when the hub reports no copy', async () => {
    const rig = rigOf(() => DONE(ITEM, null));
    const result = await rig.run('drive.keep', { item: ITEM, folder: FOLDER });
    expect(result).toMatchObject({ ok: false });
  });

  it('fails with the hub reason when the folder cannot be written', async () => {
    const rig = rigOf(() => ({
      done: [],
      failed: [{ itemId: ITEM, reason: 'That library folder is read only.' }],
      conflicts: [],
    }));
    const result = await rig.run('drive.keep', { item: ITEM, folder: FOLDER });
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(failureMessage(result)).toContain('That library folder is read only.');
  });
});
