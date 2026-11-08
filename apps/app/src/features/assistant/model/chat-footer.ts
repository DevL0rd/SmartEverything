import type { AiChatRow, AiHarnessTarget, AssistantMessageRow } from '@smarteverything/domain';

export interface FooterFacts {
  readonly costMicros: number;
  readonly costIncomplete: boolean;
  readonly context: number | null;
  readonly replies: number;
  readonly files: number;
}

type CostedChat = Pick<AiChatRow, 'id' | 'parent_id' | 'kind' | 'cost_micros' | 'cost_incomplete'>;

export function helperRuns<Chat extends CostedChat>(
  chats: readonly Chat[],
  rootId: string,
): readonly Chat[] {
  const byParent = new Map<string, Chat[]>();
  for (const chat of chats) {
    if (chat.kind !== 'subagent' || chat.parent_id === null) continue;
    const siblings = byParent.get(chat.parent_id);
    if (siblings === undefined) byParent.set(chat.parent_id, [chat]);
    else siblings.push(chat);
  }
  const seen = new Set<string>([rootId]);
  const found: Chat[] = [];
  const queue = [rootId];
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    for (const child of byParent.get(id) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      found.push(child);
      queue.push(child.id);
    }
  }
  return found;
}

export function footerFacts(
  chat: Pick<AiChatRow, 'cost_micros' | 'cost_incomplete' | 'context_percent'>,
  rows: readonly Pick<AssistantMessageRow, 'role' | 'attachments'>[],
  helpers: readonly Pick<AiChatRow, 'cost_micros' | 'cost_incomplete'>[] = [],
): FooterFacts | null {
  const facts = {
    costMicros: helpers.reduce((total, helper) => total + helper.cost_micros, chat.cost_micros),
    costIncomplete:
      chat.cost_incomplete === true || helpers.some((helper) => helper.cost_incomplete === true),
    context: chat.context_percent,
    replies: rows.filter((row) => row.role === 'responder').length,
    files: rows.reduce((total, row) => total + row.attachments.length, 0),
  };
  return facts.costMicros <= 0 && facts.context === null ? null : facts;
}

export function cachePercent(chat: Pick<AiChatRow, 'cache_percent'>): number | null {
  return chat.cache_percent;
}

const COMPACT_SHOWN_AT = 60;

export function compactShown(percent: number | null): boolean {
  return percent !== null && percent >= COMPACT_SHOWN_AT;
}

export interface CostTextInput {
  readonly money: { readonly cost: (micros: number) => string };
  readonly micros: number;
  readonly incomplete: boolean;
  readonly working: boolean;
}

export function costText({ money, micros, incomplete, working }: CostTextInput): string | null {
  if (micros <= 0) return null;
  const unknown = incomplete && !working ? ' + unknown' : '';
  return `${money.cost(micros)}${unknown}`;
}

export type CacheBand = 'none' | 'low' | 'part' | 'most' | 'all';

const CACHE_BAND_CUTS: readonly (readonly [number, CacheBand])[] = [
  [95, 'all'],
  [60, 'most'],
  [25, 'part'],
  [1, 'low'],
];

export function cacheBand(percent: number | null): CacheBand {
  if (percent === null) return 'none';
  for (const [floor, band] of CACHE_BAND_CUTS) {
    if (percent >= floor) return band;
  }
  return 'none';
}

export function cacheLabel(percent: number | null): string | null {
  return percent === null ? null : `Recent input from cache: ${String(percent)}%`;
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
