import { describe, expect, it } from 'vitest';
import type { MessageToken } from '../../model/mentions';
import { mentionRuleOf, runPartsOf } from './mention-runs';
import { parseMarkdown, type Inline } from '@smarteverything/domain/markdown';

const TOKENS: readonly MessageToken[] = [
  { kind: 'mention', text: '@Nova', participantId: 'helper:n', ink: 'viz-3', self: false },
  { kind: 'text', text: ' and ' },
  { kind: 'mention', text: '@Nova Prime', participantId: 'helper:p', ink: 'viz-5', self: false },
];

function inlineOf(text: string): readonly Inline[] {
  const block = parseMarkdown(text)[0];
  return block?.kind === 'paragraph' ? block.inline : [];
}

describe('runPartsOf', () => {
  it('splits mentions out of text runs without changing the rendered text', () => {
    const inline = inlineOf('ask @Nova Prime, then **bold** @Nova.');
    const parts = runPartsOf(inline, mentionRuleOf(TOKENS));
    expect(parts.map((part) => part.text).join('')).toBe(inline.map((part) => part.text).join(''));
    expect(parts.filter((part) => part.kind === 'mention')).toEqual([
      { kind: 'mention', text: '@Nova Prime', mark: { ink: 'viz-5', self: false } },
      { kind: 'mention', text: '@Nova', mark: { ink: 'viz-3', self: false } },
    ]);
  });

  it('leaves runs untouched when the message has no mentions', () => {
    const inline = inlineOf('plain @Nova');
    expect(runPartsOf(inline, mentionRuleOf(null))).toBe(inline);
    expect(mentionRuleOf([{ kind: 'text', text: 'plain' }])).toBeNull();
  });

  it('builds the rule once per token list and the split once per run list', () => {
    const rule = mentionRuleOf(TOKENS);
    expect(mentionRuleOf(TOKENS)).toBe(rule);
    const inline = inlineOf('hi @Nova');
    expect(runPartsOf(inline, rule)).toBe(runPartsOf(inline, rule));
  });
});
