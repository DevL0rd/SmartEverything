import {
  JSON_VALUE,
  PLUGIN_MANIFEST,
  pluginNodeKindId,
  pluginSignalSource,
  pluginTriggerKindId,
  signalMatchesMatcher,
  type PluginOptionPage,
  type PluginOptionQuery,
  type SignalInput,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { failure, type HubTool, type ToolSource } from '../../../src/ai-tools/hub-tool';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import { createKindCatalog, syncContribution } from '../../../src/automations/plugin-kinds/catalog';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import {
  PLUGIN_NODE_PREFIX,
  pluginNodeEffects,
} from '../../../src/automations/plugin-kinds/perform';
import { compileTriggers, signalFire } from '../../../src/automations/triggers-v3/armers';
import { readPointer } from '../../../src/automations/world-v3/plugin-values';
import { aibiPlugin } from '../../../src/plugins/builtin/aibi';
import { aibiTools } from '../../../src/plugins/builtin/aibi/aibi-tools';
import { ACT_NODE, FORGET_NODE } from '../../../src/plugins/builtin/aibi/automation';
import { checkAction, USABLE_ACTIONS } from '../../../src/plugins/builtin/aibi/catalogue';
import {
  ACTION_PICKER,
  actionPicker,
  labelOf,
  startWithPickers,
} from '../../../src/plugins/builtin/aibi/pickers';
import { AIBI_SETTINGS, type AibiSettings } from '../../../src/plugins/builtin/aibi/settings';
import { expectContributionValid } from '../../../src/plugins/builtin/automation-kit';
import type { PluginOptionProvider, PluginTool } from '../../../src/plugins/builtin/contract';
import { testRun } from '../../automations-v3/effects/support';
import { trigger } from '../../support/automation-fixture';
import { testStore, type TestStore } from '../../support/store';

const MANIFEST = PLUGIN_MANIFEST.parse(aibiPlugin.manifest);

const OWNER = { kind: 'plugin', id: 'aibi' } as const;

const NOW = '2026-10-25T10:00:00.000Z';

const CALLER = {
  profileId: 'p',
  role: 'owner',
  chatId: null,
  via: 'automation',
  clientId: null,
} as const;

const SETTINGS: AibiSettings = AIBI_SETTINGS.parse({});

interface Rig {
  readonly tools: readonly PluginTool[];
  readonly played: { action: string; params: Readonly<Record<string, unknown>> }[];
  readonly talking: { value: boolean };
  readonly forgotten: { left: number };
}

function rigOf(settings: AibiSettings = SETTINGS): Rig {
  const played: Rig['played'] = [];
  const talking = { value: true };
  const forgotten = { left: 2 };
  const tools = aibiTools({
    status: () => {
      throw new Error('not used');
    },
    moves: () => ({ actions: [], animations: 0 }),
    activity: { recent: () => [] },
    desk: {
      result: () => ({ spoken: false }),
      playAction: (action, params): boolean => {
        checkAction({ actions: settings.actions, animations: settings.animations }, action, params);
        if (!talking.value) return false;
        played.push({ action, params });
        return true;
      },
    },
    assistant: {
      startOver: () => {
        const more = forgotten.left > 0;
        forgotten.left -= 1;
        return Promise.resolve(more);
      },
    },
  });
  return { tools, played, talking, forgotten };
}

function toolOf(rig: Rig, name: string): PluginTool {
  const found = rig.tools.find((tool) => tool.name === name);
  if (found === undefined) throw new Error(`no tool ${name}`);
  return found;
}

function asked(
  provider: PluginOptionProvider,
  query: PluginOptionQuery,
): Promise<PluginOptionPage> {
  return provider(query, CALLER);
}

function ready(page: PluginOptionPage): readonly { id: string; label: string }[] {
  if (page.state !== 'ready') throw new Error(`not ready: ${page.message}`);
  return page.options.map(({ id, label }) => ({ id, label }));
}

describe('the AIBI automation declaration', () => {
  it('is valid and runs only tools the plugin registers', () => {
    const assembled = expectContributionValid(aibiPlugin, {
      tools: rigOf().tools.map((tool) => tool.name),
    });
    expect(assembled.rejections).toEqual([]);
  });

  it('serves the nodes, the status value and the conversation triggers as AIBI kinds', () => {
    const catalog = createKindCatalog();
    expect(syncContribution(catalog, pluginContribution(MANIFEST)).rejections).toEqual([]);
    for (const id of ['act', 'forget']) {
      expect(catalog.get(pluginNodeKindId(OWNER, id))).toMatchObject({ class: 'effect' });
    }
    expect(catalog.get(pluginNodeKindId(OWNER, 'status'))).toBeDefined();
    for (const id of ['conversation_started', 'conversation_ended']) {
      expect(catalog.get(pluginTriggerKindId(OWNER, id))).toMatchObject({ class: 'trigger' });
    }
  });

  it('sends actions by default, with an error exit for a refusal, and keeps forget to the owner', () => {
    const { nodes, entities } = MANIFEST.contributes.automation;
    expect(nodes.map((node) => [node.id, node.kind])).toEqual([
      ['act', 'action'],
      ['forget', 'action'],
    ]);
    const act = nodes.find((node) => node.id === ACT_NODE.id);
    expect(act?.mode).toBeUndefined();
    expect(act?.errors).toEqual({ refused: 'Refused' });
    expect(act?.timeout).toBeDefined();
    expect(act?.inputs.map((port) => port.name)).toEqual(['action', 'volume', 'mood']);
    expect(act?.inputs.find((port) => port.name === 'action')?.type).toEqual({
      t: 'entity',
      of: 'aibi.action',
    });
    const forget = nodes.find((node) => node.id === FORGET_NODE.id);
    expect(forget?.access).toBe('owner');
    expect(forget?.waitOnly).toEqual(['forgotten']);
    expect(entities.map((entity) => entity.options)).toEqual([ACTION_PICKER]);
  });

  it('offers the volume and mood choices the catalogue really accepts', () => {
    const choices = (name: string): readonly string[] => {
      const type = ACT_NODE.inputs.find((port) => port.name === name)?.type;
      return type?.t === 'choice' ? type.options.map((option) => option.id) : [];
    };
    expect(choices('volume')).toEqual(['high', 'low', 'mute']);
    expect(choices('mood')).toContain('mood_happy');
    for (const volume of choices('volume')) {
      expect(() => checkAction(SETTINGS, 'function_set_volume', { volume })).not.toThrow();
    }
    for (const mood of choices('mood')) {
      expect(() => checkAction(SETTINGS, 'interact_mood', { mood })).not.toThrow();
    }
  });

  it('reads the status outputs from the status stream the plugin publishes', () => {
    const [status] = MANIFEST.contributes.automation.values;
    expect(status?.from.stream).toBe('aibi.status');
    const reading = JSON_VALUE.parse({
      conversation: true,
      waiting: 2,
      robot: { firmware: '1.2.3' },
    });
    const read = Object.fromEntries(
      (status?.outputs ?? []).map((port) => [port.name, readPointer(reading, port.from)]),
    );
    expect(read).toEqual({ inConversation: true, waiting: 2, firmware: '1.2.3' });
  });
});

describe('the AIBI action picker', () => {
  it('lists every usable action once with a plain label', async () => {
    const options = ready(
      await asked(
        actionPicker(() => SETTINGS),
        {},
      ),
    );
    expect(options.map((option) => option.id).sort()).toEqual([...USABLE_ACTIONS].sort());
    expect(new Set(options.map((option) => option.label)).size).toBe(options.length);
    expect(options).toContainEqual({ id: 'ability_dance', label: 'Dance' });
    expect(options).toContainEqual({ id: 'function_set_volume', label: 'Set volume' });
    expect(options).toContainEqual({ id: 'interact_mood', label: 'Mood' });
  });

  it('lists only the actions switched on in the plugin settings', async () => {
    const picker = actionPicker(() => ({
      ...SETTINGS,
      actions: ['ability_dance', 'ability_chatgpt', 'unknown_action'],
    }));
    expect(ready(await asked(picker, {}))).toEqual([{ id: 'ability_dance', label: 'Dance' }]);
  });

  it('searches, resolves stored ids and pages without dropping any', async () => {
    const picker = actionPicker(() => SETTINGS);
    expect(ready(await asked(picker, { q: 'take photo' })).map((option) => option.id)).toEqual([
      'ability_take_photo',
    ]);
    expect(
      ready(await asked(picker, { ids: 'behavior_sleep,missing,ability_dance' })).map(
        (option) => option.id,
      ),
    ).toEqual(['ability_dance', 'behavior_sleep']);
    const first = await asked(picker, {});
    const second =
      first.state === 'ready' && first.next !== null
        ? await asked(picker, { after: first.next })
        : first;
    expect([...ready(first), ...(second === first ? [] : ready(second))]).toHaveLength(
      USABLE_ACTIONS.length,
    );
  });

  it('follows a change of the settings and lets go of the source when the plugin stops', async () => {
    const sources = new Map<string, PluginOptionProvider>();
    const watch: { listener: ((settings: AibiSettings) => void) | null } = { listener: null };
    let stopped = 0;
    const stop = await startWithPickers(
      {
        settings: SETTINGS,
        settingsChanged: (next): (() => void) => {
          watch.listener = next;
          return (): void => {
            watch.listener = null;
          };
        },
        options: {
          register: (source, provider): (() => void) => {
            sources.set(source, provider);
            return (): void => {
              sources.delete(source);
            };
          },
        },
      },
      () =>
        Promise.resolve(() => {
          stopped += 1;
          return Promise.resolve();
        }),
    );
    const picker = sources.get(ACTION_PICKER);
    if (picker === undefined || watch.listener === null) {
      throw new Error('the picker was not registered');
    }
    expect(ready(await asked(picker, {})).length).toBe(USABLE_ACTIONS.length);
    watch.listener({ ...SETTINGS, actions: ['behavior_sleep'] });
    expect(ready(await asked(picker, {}))).toEqual([{ id: 'behavior_sleep', label: 'Sleep' }]);
    await stop();
    expect(stopped).toBe(1);
    expect(sources.size).toBe(0);
    expect(watch.listener).toBeNull();
  });

  it('labels an id without its group word or trailing number', () => {
    expect(labelOf('ability_friends_add')).toBe('Friends add');
    expect(labelOf('mood_angry1')).toBe('Angry');
    expect(labelOf('high')).toBe('High');
  });
});

describe('the AIBI act tool', () => {
  it('plays the picked action with its volume or mood while AIBI is in a conversation', async () => {
    const rig = rigOf();
    const tool = toolOf(rig, 'act');
    const dance = await tool.run({ action: 'ability_dance' }, CALLER);
    const quiet = await tool.run({ action: 'function_set_volume', volume: 'low' }, CALLER);
    const happy = await tool.run({ action: 'interact_mood', mood: 'mood_happy' }, CALLER);
    expect(dance.response).toEqual({ queued: true, action: 'ability_dance' });
    expect(quiet.response).toMatchObject({ queued: true });
    expect(happy.response).toMatchObject({ queued: true });
    expect(rig.played).toEqual([
      { action: 'ability_dance', params: {} },
      { action: 'function_set_volume', params: { volume: 'low' } },
      { action: 'interact_mood', params: { mood: 'mood_happy' } },
    ]);
  });

  it('refuses with the refused code outside a conversation', async () => {
    const rig = rigOf();
    rig.talking.value = false;
    const result = await toolOf(rig, 'act').run({ action: 'ability_dance' }, CALLER);
    expect(result.response).toMatchObject({ code: 'refused' });
    expect(result.response['error']).toContain('not in a conversation');
    expect(rig.played).toEqual([]);
  });

  it('refuses an action that is switched off and a value the action does not accept', async () => {
    const rig = rigOf({ ...SETTINGS, actions: ['function_set_volume'] });
    const tool = toolOf(rig, 'act');
    const off = await tool.run({ action: 'ability_dance' }, CALLER);
    const wrong = await tool.run({ action: 'function_set_volume', volume: 'loud' }, CALLER);
    expect(off.response).toMatchObject({ code: 'refused' });
    expect(wrong.response).toMatchObject({ code: 'refused' });
    expect(rig.played).toEqual([]);
  });

  it('accepts only an action with the options it declares', () => {
    const tool = toolOf(rigOf(), 'act');
    expect(tool.validate({ action: 'ability_dance' })).toBeNull();
    expect(tool.validate({})).not.toBeNull();
    expect(tool.validate({ action: 'ability_dance', speed: 3 })).not.toBeNull();
  });
});

let opened: TestStore;

beforeEach(async () => {
  opened = await testStore();
  opened.store.plugins.create({
    manifest: MANIFEST,
    source: 'builtin',
    location: 'builtin',
    trusted: true,
  });
});

afterEach(async () => {
  await opened.close();
});

function hubToolOf(tool: PluginTool): HubTool {
  return {
    name: `aibi__${tool.name}`,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    origin: { kind: 'plugin', pluginId: 'aibi' },
    humanOnly: tool.humanOnly,
  };
}

type Params = Record<string, string | number | boolean>;

function performer(
  tools: readonly PluginTool[],
): (kind: string, params: Params, mode?: 'wait_for_result') => Promise<unknown> {
  const byName = new Map(tools.map((tool) => [`aibi__${tool.name}`, tool]));
  const source: ToolSource = {
    tools: () => tools.map(hubToolOf),
    call: (tool, args, caller) => {
      const found = byName.get(tool.name);
      return found === undefined
        ? Promise.resolve(failure(`no tool ${tool.name}`))
        : found.run(args, caller);
    },
    validate: (tool, args) => byName.get(tool.name)?.validate(args) ?? null,
    changes: () => () => undefined,
  };
  const handlers = pluginNodeEffects({
    store: opened.store,
    events: { record: (): void => undefined },
    clock: { now: (): Date => new Date(NOW) },
    signals: { subscribe: (): (() => void) => () => undefined },
    tools: () => new ToolHub([source]),
  });
  const run = testRun();
  return async (kind, params, mode) => {
    const handler = handlers[PLUGIN_NODE_PREFIX];
    if (handler === undefined) throw new Error('no plugin performer');
    return await handler(
      params,
      {
        kind,
        node: { id: 'n', key: 'n' },
        path: 'n',
        activation: '0',
        key: 'n',
        params,
        retry: 'external',
        budget: 'effects',
        ...(mode === undefined ? {} : { mode }),
      },
      run,
    );
  };
}

describe('the AIBI nodes in an automation run', () => {
  it('plays the picked action and hands the run on', async () => {
    const rig = rigOf();
    const result = await performer(rig.tools)(
      pluginNodeKindId(OWNER, 'act'),
      { action: 'function_set_volume', volume: 'mute' },
      'wait_for_result',
    );
    expect(result).toMatchObject({ ok: true });
    expect(rig.played).toEqual([{ action: 'function_set_volume', params: { volume: 'mute' } }]);
  });

  it('leaves through the error exit as Refused when AIBI is not in a conversation', async () => {
    const rig = rigOf();
    rig.talking.value = false;
    const result = await performer(rig.tools)(
      pluginNodeKindId(OWNER, 'act'),
      { action: 'ability_dance' },
      'wait_for_result',
    );
    expect(result).toMatchObject({ ok: false, class: 'Refused', code: 'refused' });
  });

  it('starts the conversations over and says how many it archived', async () => {
    const rig = rigOf();
    const result = await performer(rig.tools)(
      pluginNodeKindId(OWNER, 'forget'),
      {},
      'wait_for_result',
    );
    expect(result).toMatchObject({ ok: true, value: { forgotten: 2 } });
  });
});

describe('the AIBI conversation triggers', () => {
  function signalOf(kind: string): SignalInput {
    return {
      source: pluginSignalSource('aibi'),
      kind,
      subject: 'Conversation',
      field: null,
      value: true,
      previous: null,
      at: NOW,
      profileId: null,
      data: {},
    };
  }

  function firesOn(id: string, signal: SignalInput): boolean {
    const catalog = createKindCatalog();
    syncContribution(catalog, pluginContribution(MANIFEST));
    const compiled = compileTriggers(
      'auto-1',
      [trigger(pluginTriggerKindId(OWNER, id))],
      (kindId) => catalog.matcher(kindId),
    );
    expect(compiled.problems).toEqual([]);
    const [entry] = compiled.signals;
    if (entry === undefined) throw new Error('the trigger did not compile');
    return (
      signalMatchesMatcher(entry.matcher, signal) &&
      signalFire(compiled, signal, entry.triggerId) !== null
    );
  }

  it('fires for the event of its own name only', () => {
    expect(firesOn('conversation_started', signalOf('conversation_started'))).toBe(true);
    expect(firesOn('conversation_started', signalOf('conversation_ended'))).toBe(false);
    expect(firesOn('conversation_ended', signalOf('conversation_ended'))).toBe(true);
    expect(firesOn('conversation_ended', signalOf('conversation_started'))).toBe(false);
  });
});
