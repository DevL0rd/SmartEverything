import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { plural } from '../../../format/text';
import { CONTEXT_WARNS_AT } from './chat-subline';

export interface FooterFacts {
  readonly costMicros: number;
  readonly context: number | null;
  readonly replies: number;
  readonly files: number;
}

export function footerFacts(
  chat: Pick<AiChatRow, 'cost_micros' | 'context_percent'>,
  rows: readonly Pick<AssistantMessageRow, 'role' | 'attachments'>[],
): FooterFacts | null {
  const facts = {
    costMicros: chat.cost_micros,
    context: chat.context_percent,
    replies: rows.filter((row) => row.role === 'responder').length,
    files: rows.reduce((total, row) => total + row.attachments.length, 0),
  };
  return facts.costMicros <= 0 && facts.context === null ? null : facts;
}

export function contextTone(percent: number): 'primary' | 'warning' {
  return percent >= CONTEXT_WARNS_AT ? 'warning' : 'primary';
}

export function repliesLabel(count: number): string {
  return plural(count, 'reply', 'replies');
}

export function filesLabel(count: number): string {
  return plural(count, 'file');
}
