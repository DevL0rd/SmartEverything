import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_PLUGIN_KIND_ROW,
  PLUGIN_KIND_STATUSES,
  ROW_CHANGE,
  TABLE_ROWS,
  type NodeKind,
} from '../src';

const AT = '2026-10-25T10:00:00.000Z';

const KIND: NodeKind = {
  id: 'plugin.chat_hub.post_message',
  name: 'Post a message',
  category: 'plugins',
  icon: 'message',
  class: 'effect',
  description: 'Posts a message to a channel.',
  inputs: [
    {
      name: 'channel',
      type: { t: 'entity', of: 'chat-hub.channel' },
      required: true,
      description: 'Where.',
      ui: { label: 'Channel' },
    },
    {
      name: 'text',
      type: { t: 'text' },
      required: false,
      default: 'Hello',
      description: 'What.',
      ui: { label: 'Text', unit: 'words', options: [{ id: 'a', label: 'A' }] },
    },
  ],
  outputs: [{ name: 'messageId', type: { t: 'text' }, optional: true, description: 'The id.' }],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects', mode: 'wait_for_result' },
  summary: 'Post {text} to {channel}',
  keywords: ['chat'],
  modes: { default: 'wait_for_result', allowed: ['wait_for_result', 'fire_and_forget'] },
  origin: { kind: 'plugin', id: 'chat-hub', name: 'Chat hub', icon: 'puzzle', version: '1.2.0' },
  access: 'owner',
  tier: 'v1',
};

const ROW = {
  kind_id: KIND.id,
  owner: 'plugin:chat-hub',
  version: '1.2.0',
  interface_hash: 'b'.repeat(64),
  declaration: KIND,
  status: 'active',
  updated: AT,
};

describe('AUTOMATION_PLUGIN_KIND_ROW', () => {
  it('accepts a stored kind and returns it unchanged', () => {
    expect(AUTOMATION_PLUGIN_KIND_ROW.parse(ROW)).toStrictEqual(ROW);
  });

  it('knows the three statuses', () => {
    expect(PLUGIN_KIND_STATUSES).toStrictEqual(['active', 'off', 'retired']);
    for (const status of PLUGIN_KIND_STATUSES) {
      expect(AUTOMATION_PLUGIN_KIND_ROW.safeParse({ ...ROW, status }).success).toBe(true);
    }
    expect(AUTOMATION_PLUGIN_KIND_ROW.safeParse({ ...ROW, status: 'gone' }).success).toBe(false);
  });

  it('refuses an owner that is neither a plugin nor a driver, a bad hash and extra columns', () => {
    for (const bad of [
      { owner: 'provider:x' },
      { owner: 'plugin:' },
      { interface_hash: 'xyz' },
      { updated: 'yesterday' },
      { version: '' },
      { extra: 1 },
    ]) {
      expect(AUTOMATION_PLUGIN_KIND_ROW.safeParse({ ...ROW, ...bad }).success).toBe(false);
    }
  });

  it('refuses a declaration that is not a plain, known node kind', () => {
    for (const bad of [
      { ...KIND, reads: (): readonly string[] => [] },
      { ...KIND, category: 'nowhere' },
      { ...KIND, class: 'magic' },
      { ...KIND, extra: true },
      { ...KIND, inputs: [{ name: 'x', type: { t: 'nothing' }, required: true, description: '' }] },
      {
        ...KIND,
        inputs: [
          {
            name: 'x',
            type: { t: 'text' },
            required: true,
            description: '',
            ui: { optionsFrom: 'not-a-source' },
          },
        ],
      },
      { ...KIND, origin: { ...KIND.origin, kind: 'cloud' } },
    ]) {
      expect(AUTOMATION_PLUGIN_KIND_ROW.safeParse({ ...ROW, declaration: bad }).success).toBe(
        false,
      );
    }
  });
});

describe('the automation_plugin_kinds live table', () => {
  it('is a live table with its own row and change schema', () => {
    expect(TABLE_ROWS.automation_plugin_kinds).toBe(AUTOMATION_PLUGIN_KIND_ROW);
    const change = {
      type: 'change',
      table: 'automation_plugin_kinds',
      operation: 'INSERT',
      record: ROW,
      oldRecord: null,
    };
    expect(ROW_CHANGE.parse(change)).toStrictEqual(change);
    expect(ROW_CHANGE.safeParse({ ...change, record: { ...ROW, status: 'gone' } }).success).toBe(
      false,
    );
  });
});
