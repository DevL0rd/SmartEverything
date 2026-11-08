import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  PLUGIN_MANIFEST,
  PLUGIN_TRIGGER,
  signalMatchesMatcher,
  type PluginManifest,
  type SignalInput,
} from '@smarteverything/domain';
import {
  createKindCatalog,
  syncContribution,
  type KindSyncResult,
  type PluginKindCatalog,
} from '../../../src/automations/plugin-kinds/catalog';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import { triggersOf, triggerMapping } from '../../../src/automations/plugin-kinds/triggers';
import { compileTriggers, signalFire } from '../../../src/automations/triggers-v3/armers';
import { contributionsOf } from '../../../src/plugins/contributions';
import { trigger } from '../../support/automation-fixture';
import { testStore, type TestStore } from '../../support/store';
import { POSTED_TRIGGER } from './fixtures';

const AT = '2026-10-25T09:00:00.000Z';

const ENTITIES = [{ id: 'channel', title: 'Channel', plural: 'Channels', options: 'channels' }];

function manifestOf(
  events: readonly Record<string, unknown>[],
  automation: Record<string, unknown> = {},
): PluginManifest {
  return PLUGIN_MANIFEST.parse({
    id: 'chat-hub',
    name: 'Chat hub',
    version: '1.0.0',
    description: 'A chat service.',
    publisher: 'Tests',
    contributes: { events, automation: { entities: ENTITIES, ...automation } },
  });
}

const MESSAGE = {
  kind: 'message',
  title: 'Message',
  fields: { channel_id: 'string', length: 'number', edited: 'boolean' },
};

function contributionOf(
  events: readonly Record<string, unknown>[],
  automation?: Record<string, unknown>,
): ReturnType<typeof pluginContribution> {
  return pluginContribution(manifestOf(events, automation));
}

describe('triggersOf', () => {
  it('turns every declared event into a trigger with typed filters and outputs', () => {
    const { triggers, rejections } = triggersOf(contributionOf([MESSAGE]));
    expect(rejections).toEqual([]);
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toMatchObject({
      id: 'message',
      title: 'Message',
      event: 'message',
      filters: [
        { name: 'channel_id', type: { t: 'text' }, match: 'channel_id' },
        { name: 'length', type: { t: 'number' }, match: 'length' },
        { name: 'edited', type: { t: 'boolean' }, match: 'edited' },
      ],
      outputs: [
        { name: 'channel_id', type: { t: 'text' }, from: 'channel_id' },
        { name: 'length', type: { t: 'number' }, from: 'length' },
        { name: 'edited', type: { t: 'boolean' }, from: 'edited' },
      ],
    });
  });

  it('leaves an event with an explicit trigger to that trigger', () => {
    const { triggers } = triggersOf(contributionOf([MESSAGE], { triggers: [POSTED_TRIGGER] }));
    expect(triggers.map((entry) => entry.id)).toEqual(['message_posted']);
  });

  it('adds none when automatic triggers are off', () => {
    expect(triggersOf(contributionOf([MESSAGE], { autoTriggers: false })).triggers).toEqual([]);
  });

  it('turns an event with no fields into a trigger with no filters', () => {
    const { triggers } = triggersOf(contributionOf([{ kind: 'ping', title: 'Ping' }]));
    expect(triggers[0]).toMatchObject({ id: 'ping', filters: [], outputs: [] });
  });

  it('writes dotted and dashed event kinds and field keys as usable ids', () => {
    const { triggers } = triggersOf(
      contributionOf([{ kind: 'job.done', title: 'Job done', fields: { 'job-id': 'string' } }]),
    );
    expect(triggers[0]).toMatchObject({
      id: 'job_done',
      event: 'job.done',
      filters: [{ name: 'job_id', match: 'job-id' }],
    });
  });

  it('rejects an event whose derived ids clash and keeps the rest', () => {
    const { triggers, rejections } = triggersOf(
      contributionOf([
        { kind: 'job.done', title: 'Job done' },
        { kind: 'job_done', title: 'Job finished' },
        { kind: 'other', title: 'Other', fields: { 'a-b': 'string', a_b: 'string' } },
      ]),
    );
    expect(triggers.map((entry) => entry.id)).toEqual(['job_done']);
    expect(rejections).toEqual([
      {
        kindId: 'trigger.plugin.chat_hub.job_done',
        problems: ['the trigger id job_done is already used by another trigger of this plugin'],
      },
      {
        kindId: 'trigger.plugin.chat_hub.other',
        problems: ['the filter a_b is declared twice', 'the output a_b is declared twice'],
      },
    ]);
  });

  it('rejects an event whose title would break the summary', () => {
    const { triggers, rejections } = triggersOf(
      contributionOf([{ kind: 'odd', title: 'Odd {one}' }]),
    );
    expect(triggers).toEqual([]);
    expect(rejections[0]?.kindId).toBe('trigger.plugin.chat_hub.odd');
  });
});

describe('triggerMapping', () => {
  it('maps a driver device event onto the event source with the device as subject', () => {
    const owner = { kind: 'driver', id: 'treadmill' } as const;
    const contribution = { ...contributionOf([]), owner, signalSource: null };
    const mapped = PLUGIN_TRIGGER.parse({
      id: 'walk_finished',
      version: 1,
      title: 'Walk finished',
      description: 'A walk ends.',
      icon: 'walk',
      summary: 'Walk finished on {device}',
      event: { deviceEvent: 'activity', match: { activity: 'walk' } },
      filters: [
        {
          name: 'device',
          title: 'Treadmill',
          type: { t: 'ref', of: 'device' },
          match: 'subject',
          description: 'Which one.',
        },
      ],
      outputs: [{ name: 'at', title: 'When', type: { t: 'instant' }, from: 'at' }],
    });
    expect(triggerMapping(contribution, mapped)).toEqual({
      variantPort: null,
      defaultVariant: '',
      variants: { '': { source: 'event', kind: 'activity', match: { activity: 'walk' } } },
      subjectPort: 'device',
      fieldPort: null,
      matchPorts: {},
      runtimePorts: [],
      outputs: { at: 'at' },
    });
  });

  it('is null for a string event when the owner has no signal source', () => {
    const [explicit] = triggersOf(contributionOf([MESSAGE])).triggers;
    if (explicit === undefined) throw new Error('no trigger');
    expect(
      triggerMapping({ ...contributionOf([MESSAGE]), signalSource: null }, explicit),
    ).toBeNull();
  });
});

function catalogOf(
  events: readonly Record<string, unknown>[],
  automation?: Record<string, unknown>,
): { readonly catalog: PluginKindCatalog; readonly synced: KindSyncResult } {
  const catalog = createKindCatalog();
  const contribution = contributionOf(events, automation);
  const synced = syncContribution(catalog, contribution);
  return { catalog, synced };
}

let opened: TestStore;

beforeAll(async () => {
  opened = await testStore();
});

afterAll(async () => {
  await opened.close();
});

function emitted(
  manifest: PluginManifest,
  event: { kind: string; subject: string | null; data: Record<string, string | number | boolean> },
): SignalInput {
  const seen: SignalInput[] = [];
  const { sinks } = contributionsOf(
    {
      store: opened.store,
      signals: {
        emit: (signal) => {
          seen.push(signal);
        },
        register: vi.fn(),
      },
      inbound: vi.fn(),
      now: () => new Date(AT),
    },
    manifest,
    vi.fn(),
  );
  sinks.event(event);
  const [signal] = seen;
  if (signal === undefined || seen.length !== 1) throw new Error('expected exactly one signal');
  return signal;
}

describe('plugin triggers through the catalog', () => {
  const KIND = 'trigger.plugin.chat_hub.message';

  it('serves the automatic trigger as a kind and as a matcher', () => {
    const { catalog, synced } = catalogOf([MESSAGE]);
    expect(synced.rejections).toEqual([]);
    expect(catalog.get(KIND)).toMatchObject({ class: 'trigger', category: 'plugins' });
    expect(catalog.matcher(KIND)).toMatchObject({
      variants: { '': { source: 'plugin_chat_hub', kind: 'message' } },
      matchPorts: { channel_id: 'channel_id', length: 'length', edited: 'edited' },
      outputs: { channel_id: 'channel_id', length: 'length', edited: 'edited' },
    });
  });

  it('fires an automatic trigger on a plugin event and hands the fields on', () => {
    const manifest = manifestOf([MESSAGE]);
    const { catalog } = catalogOf([MESSAGE]);
    const compiled = compileTriggers('auto-1', [trigger(KIND, { channel_id: 'general' })], (kind) =>
      catalog.matcher(kind),
    );
    expect(compiled.problems).toEqual([]);
    const [entry] = compiled.signals;
    if (entry === undefined) throw new Error('the trigger did not compile');
    const hit = emitted(manifest, {
      kind: 'message',
      subject: null,
      data: { channel_id: 'general', length: 12, edited: false },
    });
    expect(signalMatchesMatcher(entry.matcher, hit)).toBe(true);
    const fire = signalFire(compiled, hit, entry.triggerId);
    expect(fire?.payload).toEqual({
      channel_id: 'general',
      length: 12,
      edited: false,
      at: AT,
    });
    const miss = emitted(manifest, {
      kind: 'message',
      subject: null,
      data: { channel_id: 'random', length: 12, edited: false },
    });
    expect(signalMatchesMatcher(entry.matcher, miss)).toBe(false);
  });

  it('fires an explicit trigger on its filter and maps its declared output', () => {
    const automation = { triggers: [POSTED_TRIGGER] };
    const { catalog } = catalogOf([{ ...MESSAGE, fields: { channel_id: 'string' } }], automation);
    const kind = 'trigger.plugin.chat_hub.message_posted';
    const compiled = compileTriggers('auto-2', [trigger(kind, { channel: 'c-9' })], (id) =>
      catalog.matcher(id),
    );
    const [entry] = compiled.signals;
    if (entry === undefined) throw new Error('the trigger did not compile');
    const hit = emitted(manifestOf([{ ...MESSAGE, fields: { channel_id: 'string' } }]), {
      kind: 'message',
      subject: null,
      data: { channel_id: 'c-9', author: 'Ann' },
    });
    expect(signalMatchesMatcher(entry.matcher, hit)).toBe(true);
    expect(signalFire(compiled, hit, entry.triggerId)?.payload).toEqual({ author: 'Ann', at: AT });
  });

  it('stops serving the trigger when the plugin is removed', () => {
    const { catalog } = catalogOf([MESSAGE]);
    catalog.remove('plugin:chat-hub');
    expect(catalog.matcher(KIND)).toBeUndefined();
    expect(catalog.has(KIND)).toBe(false);
  });
});
