import { defineNodeKind } from '@smarteverything/domain';
import type { FlowNode } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { lint } from '../../src/check/lint';
import type { KindAvailability, LintContext, LintKind } from '../../src/check/lint';
import { make } from '../compile/support';
import { automation } from './c23-support';
import { lintContext } from './lint-support';

const POST = defineNodeKind({
  id: 'plugin.chat_hub.post_message',
  name: 'Post a message',
  category: 'plugins',
  icon: 'message',
  class: 'effect',
  description: 'Posts a message.',
  inputs: [],
  outputs: [],
  exits: ['next'],
  summary: 'Post a message',
  keywords: [],
  access: 'owner',
  tier: 'v1',
});

function contextWith(availability: KindAvailability | undefined): LintContext {
  const base = lintContext();
  const kind: LintKind = availability === undefined ? POST : { ...POST, availability };
  return { ...base, kinds: (id) => (id === POST.id ? kind : base.kinds(id)) };
}

function codesOf(nodes: FlowNode[], availability: KindAvailability | undefined): string[] {
  return lint(automation(nodes), contextWith(availability))
    .filter((found) => found.code === 'plugin_off' || found.code === 'plugin_kind_retired')
    .map((found) => `${found.severity}:${found.code}`);
}

const step = (extra: Partial<FlowNode> = {}): FlowNode => make('post', POST.id, {}, extra);

describe('plugin availability lint', () => {
  it('says nothing while the plugin is active or the kind has no availability', () => {
    expect(codesOf([step()], undefined)).toEqual([]);
    expect(codesOf([step()], { status: 'active', plugin: 'Chat Hub' })).toEqual([]);
  });

  it('gives advice, not an error, while the plugin is switched off', () => {
    const found = lint(
      automation([step()]),
      contextWith({ status: 'off', plugin: 'Chat Hub' }),
    ).filter((item) => item.code === 'plugin_off');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      severity: 'warning',
      key: 'post',
      received: POST.id,
    });
    expect(found[0]?.message).toContain('Chat Hub is switched off');
    expect(found[0]?.message).toContain('Unreachable');
  });

  it('errors on a retired kind and names the replacement when there is one', () => {
    const [found] = lint(
      automation([step()]),
      contextWith({ status: 'retired', plugin: 'Chat Hub', replacedBy: 'plugin.chat_hub.send' }),
    ).filter((item) => item.code === 'plugin_kind_retired');
    expect(found).toMatchObject({
      severity: 'error',
      key: 'post',
      received: POST.id,
      expected: 'plugin.chat_hub.send',
      fix: { summary: 'replace this step with plugin.chat_hub.send' },
    });
    expect(found?.message).toContain('Use plugin.chat_hub.send instead.');
  });

  it('errors on a retired kind without a replacement and offers no expected value', () => {
    const [found] = lint(
      automation([step()]),
      contextWith({ status: 'retired', plugin: 'Chat Hub' }),
    ).filter((item) => item.code === 'plugin_kind_retired');
    expect(found?.expected).toBeUndefined();
    expect(found?.fix?.summary).toBe('replace this step or remove it');
  });

  it('ignores a disabled step', () => {
    expect(codesOf([step({ enabled: false })], { status: 'retired', plugin: 'Chat Hub' })).toEqual(
      [],
    );
  });

  it('checks triggers too', () => {
    const trigger = defineNodeKind({
      ...POST,
      id: 'trigger.plugin.chat_hub.posted',
      class: 'trigger',
      exits: [],
    });
    const base = lintContext();
    const ctx: LintContext = {
      ...base,
      kinds: (id) =>
        id === trigger.id
          ? { ...trigger, availability: { status: 'off', plugin: 'Chat Hub' } }
          : base.kinds(id),
    };
    const program = automation([], {
      triggers: [
        {
          id: '00000000-0000-4000-8000-0000000000aa',
          key: 'posted',
          kind: trigger.id,
          ports: {},
        },
      ],
    });
    expect(lint(program, ctx).filter((found) => found.code === 'plugin_off')).toHaveLength(1);
  });
});
