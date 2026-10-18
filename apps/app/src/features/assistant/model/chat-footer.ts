import type { AiChatRow, AiHarnessTarget, AssistantMessageRow } from '@smarteverything/domain';

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

const COMPACT_SHOWN_AT = 60;

export function compactShown(percent: number | null): boolean {
  return percent !== null && percent >= COMPACT_SHOWN_AT;
}

export interface ExecutionFacts {
  readonly runtime: string | null;
  readonly host: string;
  readonly path: string | null;
  readonly offline: boolean;
  readonly switchingTo: string | null;
}

export interface ExecutionLine {
  readonly text: string;
  readonly warning: boolean;
  readonly cancel: (() => void) | null;
}

export function executionFolderPath(
  target: AiHarnessTarget,
  sessionPath: string | null,
): string | null {
  return target.kind === 'server' ? null : sessionPath;
}

function folderName(path: string | null): string | null {
  const segment = path?.split(/[\\/]/u).findLast((part) => part.length > 0);
  return segment === undefined || segment === '~' ? null : segment;
}

export function executionLineOf(facts: ExecutionFacts): ExecutionLine {
  if (facts.switchingTo !== null) {
    return {
      text: `Switching to ${facts.switchingTo} after the current step…`,
      warning: false,
      cancel: null,
    };
  }
  if (facts.offline) {
    return { text: `${facts.host} is offline`, warning: true, cancel: null };
  }
  const where = facts.runtime === null ? facts.host : `${facts.runtime} on ${facts.host}`;
  const folder = folderName(facts.path);
  return { text: folder === null ? where : `${where} · ${folder}`, warning: false, cancel: null };
}
