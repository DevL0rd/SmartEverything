import { describe, expect, it } from 'vitest';
import { kindProblems } from '@smarteverything/domain';
import {
  assembleContribution,
  kindStatusDetail,
} from '../../../src/automations/plugin-kinds/assemble';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import { ONLINE_VALUE, POSTED_TRIGGER, POST_NODE, manifestWith } from './fixtures';

const ALL = { nodes: [POST_NODE], triggers: [POSTED_TRIGGER], values: [ONLINE_VALUE] };

describe('assembleContribution', () => {
  it('turns every declaration into a valid node kind with its origin', () => {
    const assembled = assembleContribution(pluginContribution(manifestWith('chat-hub', ALL)));
    expect(assembled.rejections).toEqual([]);
    expect(assembled.owner).toBe('plugin:chat-hub');
    expect(assembled.kinds.map((kind) => kind.id)).toEqual([
      'plugin.chat_hub.post_message',
      'plugin.chat_hub.members_online',
      'trigger.plugin.chat_hub.message_posted',
    ]);
    for (const kind of assembled.kinds) {
      expect(kindProblems(kind)).toEqual([]);
      expect(kind).toMatchObject({ category: 'plugins', tier: 'v1' });
      expect(kind.origin).toEqual({
        kind: 'plugin',
        id: 'chat-hub',
        name: 'Chat hub',
        icon: 'puzzle',
        version: '1.2.0',
      });
    }
  });

  it('gives an action its effect, modes, ports and owner access', () => {
    const [node] = assembleContribution(
      pluginContribution(manifestWith('chat-hub', { nodes: [POST_NODE] })),
    ).kinds;
    expect(node).toMatchObject({
      class: 'effect',
      exits: ['next'],
      effect: { retry: 'external', budget: 'effects', mode: 'fire_and_forget', timeout: 10_000 },
      modes: { default: 'fire_and_forget', allowed: ['fire_and_forget', 'wait_for_result'] },
      access: 'owner',
    });
    expect(node?.inputs[1]).toEqual({
      name: 'text',
      type: { t: 'text' },
      required: false,
      default: 'Hello',
      description: 'What.',
      ui: { label: 'Text', unit: 'words' },
    });
    expect(node?.outputs).toEqual([
      { name: 'messageId', type: { t: 'text' }, description: 'The id.' },
    ]);
  });

  it('compiles a plugin trigger to a matcher on the plugin signal with its filters', () => {
    const assembled = assembleContribution(
      pluginContribution(manifestWith('chat-hub', { triggers: [POSTED_TRIGGER] })),
    );
    const id = 'trigger.plugin.chat_hub.message_posted';
    expect(assembled.matchers[id]).toEqual({
      variantPort: null,
      defaultVariant: '',
      variants: { '': { source: 'plugin_chat_hub', kind: 'message' } },
      subjectPort: null,
      fieldPort: null,
      matchPorts: { channel: 'channel_id' },
      runtimePorts: [],
      outputs: { author: 'author' },
    });
    expect(assembled.kinds[0]?.inputs.map((port) => port.name)).toEqual(['channel', 'cooldown']);
  });

  it('rejects only the bad kinds and keeps the rest', () => {
    const broken = {
      ...POST_NODE,
      id: 'broken',
      inputs: [{ ...POST_NODE.inputs[0], required: true, default: 'x' }, POST_NODE.inputs[1]],
    };
    const unknownEvent = { ...POSTED_TRIGGER, id: 'other', event: 'nothing' };
    const assembled = assembleContribution(
      pluginContribution(
        manifestWith('chat-hub', {
          nodes: [POST_NODE, broken],
          triggers: [POSTED_TRIGGER, unknownEvent],
        }),
      ),
    );
    expect(assembled.kinds.map((kind) => kind.id)).toEqual([
      'plugin.chat_hub.post_message',
      'trigger.plugin.chat_hub.message_posted',
    ]);
    expect(assembled.rejections).toEqual([
      {
        kindId: 'plugin.chat_hub.broken',
        problems: ['input "channel" is required and also has a default'],
      },
      {
        kindId: 'trigger.plugin.chat_hub.other',
        problems: ['the event nothing is not declared in contributes.events'],
      },
    ]);
    expect(kindStatusDetail(assembled.rejections)).toContain('plugin.chat_hub.broken');
  });
});

describe('kindStatusDetail', () => {
  it('is null without rejections and names every rejected kind with its problems', () => {
    expect(kindStatusDetail([])).toBeNull();
    const many = Array.from({ length: 30 }, (_, index) => ({
      kindId: `plugin.chat_hub.kind_${String(index)}`,
      problems: ['the name is empty'],
    }));
    const detail = kindStatusDetail(many) ?? '';
    expect(detail.startsWith('Automation kinds rejected: ')).toBe(true);
    for (const item of many) expect(detail).toContain(`${item.kindId} (the name is empty)`);
  });
});
