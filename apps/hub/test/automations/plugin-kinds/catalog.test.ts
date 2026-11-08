import { describe, expect, it, vi } from 'vitest';
import { DEVICE_MATCHER_MAPPINGS, NODE_REGISTRY, type NodeKind } from '@smarteverything/domain';
import { createKindCatalog, syncContribution } from '../../../src/automations/plugin-kinds/catalog';
import {
  pluginContribution,
  registerDriverAutomation,
  type DriverAutomationInput,
} from '../../../src/automations/plugin-kinds/contributions';
import { ONLINE_VALUE, POSTED_TRIGGER, POST_NODE, manifestWith } from './fixtures';

const WORKOUT_TRIGGER = {
  id: 'workout_done',
  version: 1,
  title: 'Workout finished',
  description: 'Fires when a walk ends.',
  icon: 'activity',
  summary: 'A workout finished',
  event: { deviceEvent: 'activity', match: { activity: 'workout_finished' } },
} as const;

type DriverTriggers = NonNullable<DriverAutomationInput['automation']>['triggers'];

function driver(triggers: DriverTriggers): DriverAutomationInput {
  return {
    id: 'kingsmith-g15',
    name: 'Kingsmith G15',
    icon: 'activity',
    version: '1.0.0',
    automation: { triggers },
  };
}

describe('createKindCatalog', () => {
  it('serves core kinds first and plugin kinds after a sync', () => {
    const catalog = createKindCatalog();
    const listener = vi.fn();
    catalog.changes(listener);
    expect(catalog.get('trigger.signal')).toBe(NODE_REGISTRY.get('trigger.signal'));
    expect(catalog.matcher('trigger.device')).toBe(DEVICE_MATCHER_MAPPINGS['trigger.device']);
    const result = syncContribution(
      catalog,
      pluginContribution(
        manifestWith('chat-hub', {
          nodes: [POST_NODE],
          triggers: [POSTED_TRIGGER],
          values: [ONLINE_VALUE],
        }),
      ),
    );
    expect(result.statusDetail).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(catalog.has('plugin.chat_hub.post_message')).toBe(true);
    expect(catalog.get('plugin.chat_hub.members_online')?.class).toBe('read');
    expect(catalog.matcher('trigger.plugin.chat_hub.message_posted')?.variants['']).toEqual({
      source: 'plugin_chat_hub',
      kind: 'message',
    });
    expect(catalog.kinds()).toHaveLength(NODE_REGISTRY.kinds.length + 3);
  });

  it('rejects an id another owner already holds and logs it without throwing', () => {
    const catalog = createKindCatalog();
    const first = pluginContribution(
      manifestWith('driver-kingsmith-g15', {
        triggers: [{ ...WORKOUT_TRIGGER, event: 'message' }],
      }),
    );
    expect(syncContribution(catalog, first).accepted).toEqual([
      'trigger.plugin.driver_kingsmith_g15.workout_done',
    ]);
    const stop = registerDriverAutomation(catalog, driver([WORKOUT_TRIGGER]));
    expect(catalog.get('trigger.plugin.driver_kingsmith_g15.workout_done')?.origin?.kind).toBe(
      'plugin',
    );
    stop();
    expect(catalog.has('trigger.plugin.driver_kingsmith_g15.workout_done')).toBe(true);
  });

  it('rejects a plugin kind that reuses a core id into the status detail', () => {
    const [kind] = syncAndList();
    const core = {
      registry: { get: (): NodeKind | undefined => kind, has: (): boolean => true, kinds: [] },
      matchers: {},
    };
    const catalog = createKindCatalog(core);
    const result = syncContribution(
      catalog,
      pluginContribution(manifestWith('chat-hub', { nodes: [POST_NODE], autoTriggers: false })),
    );
    expect(result.accepted).toEqual([]);
    expect(result.statusDetail).toBe(
      'Automation kinds rejected: plugin.chat_hub.post_message (the id is already used by a core kind)',
    );
  });

  it('replaces an owner on a new sync and drops its kinds on remove', () => {
    const catalog = createKindCatalog();
    syncContribution(catalog, pluginContribution(manifestWith('chat-hub', { nodes: [POST_NODE] })));
    syncContribution(
      catalog,
      pluginContribution(manifestWith('chat-hub', { values: [ONLINE_VALUE] })),
    );
    expect(catalog.has('plugin.chat_hub.post_message')).toBe(false);
    expect(catalog.has('plugin.chat_hub.members_online')).toBe(true);
    catalog.remove('plugin:chat-hub');
    expect(catalog.kinds()).toHaveLength(NODE_REGISTRY.kinds.length);
  });
});

describe('registerDriverAutomation', () => {
  it('registers device event triggers under the driver owner and unregisters them', () => {
    const catalog = createKindCatalog();
    const stop = registerDriverAutomation(catalog, driver([WORKOUT_TRIGGER]));
    const id = 'trigger.plugin.driver_kingsmith_g15.workout_done';
    expect(catalog.get(id)?.origin).toEqual({
      kind: 'driver',
      id: 'kingsmith-g15',
      name: 'Kingsmith G15',
      icon: 'activity',
      version: '1.0.0',
    });
    expect(catalog.matcher(id)?.variants['']).toEqual({
      source: 'event',
      kind: 'activity',
      match: { activity: 'workout_finished' },
    });
    stop();
    expect(catalog.has(id)).toBe(false);
  });

  it('rejects a driver trigger on a plugin event and a malformed declaration', () => {
    const catalog = createKindCatalog();
    registerDriverAutomation(catalog, driver([{ ...WORKOUT_TRIGGER, event: 'message' }]));
    expect(catalog.has('trigger.plugin.driver_kingsmith_g15.workout_done')).toBe(false);
    expect(() =>
      registerDriverAutomation(catalog, driver([{ ...WORKOUT_TRIGGER, id: 'Bad id' }])),
    ).not.toThrow();
    expect(catalog.kinds()).toHaveLength(NODE_REGISTRY.kinds.length);
  });
});

function syncAndList(): readonly NodeKind[] {
  const catalog = createKindCatalog();
  syncContribution(catalog, pluginContribution(manifestWith('chat-hub', { nodes: [POST_NODE] })));
  return catalog.kinds().slice(NODE_REGISTRY.kinds.length);
}
