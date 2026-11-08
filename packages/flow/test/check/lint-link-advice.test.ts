import { TEXT_TO_ENTITY_ADVICE, defineNodeKind, type FlowType } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { lint, type LintContext } from '../../src/check/lint';
import { automation, node, wired } from './c23-support';
import { lintContext } from './lint-support';

const CHANNEL: FlowType = { t: 'entity', of: 'discord.channel' };

const GIVES_TEXT = defineNodeKind({
  id: 'probe.give_text',
  name: 'Give text',
  category: 'debug',
  icon: 'bug',
  class: 'effect',
  description: 'Gives a text.',
  inputs: [],
  outputs: [{ name: 'out', type: { t: 'text' }, description: 'A text.' }],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'none' },
  summary: 'Give text',
  keywords: ['probe'],
  access: 'member',
  tier: 'v1',
});

const GIVES_CHANNEL = defineNodeKind({
  ...GIVES_TEXT,
  id: 'probe.give_channel',
  outputs: [{ name: 'out', type: CHANNEL, description: 'A channel.' }],
});

const TAKES_CHANNEL = defineNodeKind({
  ...GIVES_TEXT,
  id: 'probe.take_channel',
  inputs: [{ name: 'channel', type: CHANNEL, required: false, description: 'A channel.' }],
  outputs: [],
});

const KINDS = new Map([GIVES_TEXT, GIVES_CHANNEL, TAKES_CHANNEL].map((kind) => [kind.id, kind]));

function context(): LintContext {
  const base = lintContext();
  return { ...base, kinds: (id) => KINDS.get(id) ?? base.kinds(id) };
}

describe('lint of links that rely on a coercion', () => {
  it('advises when a text is wired into a plugin entity port', () => {
    const program = automation([
      node('say', 'probe.give_text'),
      node('use', 'probe.take_channel', { channel: wired('say.out') }),
    ]);
    const hits = lint(program, context()).filter((item) => item.code === 'link_advice');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      severity: 'hint',
      key: 'use',
      port: 'channel',
      message: TEXT_TO_ENTITY_ADVICE,
    });
  });

  it('is quiet when an entity is wired into an entity port', () => {
    const program = automation([
      node('pick', 'probe.give_channel'),
      node('use', 'probe.take_channel', { channel: wired('pick.out') }),
    ]);
    expect(lint(program, context()).filter((item) => item.code === 'link_advice')).toEqual([]);
  });
});
