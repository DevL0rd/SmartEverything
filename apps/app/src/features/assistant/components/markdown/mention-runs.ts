import type { MessageToken } from '../../model/mentions';
import type { ParticipantInk } from '../../model/participant';
import type { Inline } from '@smarteverything/domain/markdown';

export interface MentionMark {
  readonly ink: ParticipantInk;
  readonly self: boolean;
}

export interface MentionRule {
  readonly pattern: RegExp;
  readonly marks: ReadonlyMap<string, MentionMark>;
}

export type RunPart =
  Inline | { readonly kind: 'mention'; readonly text: string; readonly mark: MentionMark };

const NAME_EDGE = '[\\p{L}\\p{N}_]';

const rules = new WeakMap<readonly MessageToken[], MentionRule | null>();

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ruleFrom(tokens: readonly MessageToken[]): MentionRule | null {
  const marks = new Map<string, MentionMark>();
  for (const token of tokens) {
    if (token.kind === 'mention') marks.set(token.text, { ink: token.ink, self: token.self });
  }
  if (marks.size === 0) return null;
  const texts = [...marks.keys()].sort((left, right) => right.length - left.length);
  const pattern = new RegExp(
    `(?<!${NAME_EDGE})(?:${texts.map(escaped).join('|')})(?!${NAME_EDGE})`,
    'gu',
  );
  return { pattern, marks };
}

export function mentionRuleOf(tokens: readonly MessageToken[] | null): MentionRule | null {
  if (tokens === null) return null;
  const known = rules.get(tokens);
  if (known !== undefined) return known;
  const rule = ruleFrom(tokens);
  rules.set(tokens, rule);
  return rule;
}

function splitText(text: string, rule: MentionRule): readonly RunPart[] {
  const parts: RunPart[] = [];
  let at = 0;
  for (const match of text.matchAll(rule.pattern)) {
    const mark = rule.marks.get(match[0]);
    if (mark === undefined) continue;
    if (match.index > at) parts.push({ kind: 'text', text: text.slice(at, match.index) });
    parts.push({ kind: 'mention', text: match[0], mark });
    at = match.index + match[0].length;
  }
  if (at === 0) return [{ kind: 'text', text }];
  if (at < text.length) parts.push({ kind: 'text', text: text.slice(at) });
  return parts;
}

interface Split {
  readonly rule: MentionRule;
  readonly parts: readonly RunPart[];
}

const splits = new WeakMap<readonly Inline[], Split>();

export function runPartsOf(
  inline: readonly Inline[],
  rule: MentionRule | null,
): readonly RunPart[] {
  if (rule === null) return inline;
  const known = splits.get(inline);
  if (known?.rule === rule) return known.parts;
  const parts = inline.flatMap((part) =>
    part.kind === 'text' ? splitText(part.text, rule) : [part],
  );
  splits.set(inline, { rule, parts });
  return parts;
}
