import type { AssistantMessageRow } from '@smarteverything/domain';

export const CONTEXT_WARNS_AT = 80;

export const CONTEXT_COMPACTS_AT = 85;

export type Subline =
  | { readonly kind: 'working'; readonly step: string | null }
  | { readonly kind: 'needs-you' }
  | { readonly kind: 'waiting'; readonly count: number }
  | { readonly kind: 'queued'; readonly count: number }
  | { readonly kind: 'switching' }
  | { readonly kind: 'reconnecting' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'lead'; readonly text: string }
  | { readonly kind: 'none' };

export interface SublineInput {
  readonly working: boolean;
  readonly step: string | null;
  readonly needsYou: boolean;
  readonly waiting: number;
  readonly queued: number;
  readonly switching: boolean;
  readonly reconnecting: boolean;
  readonly failed: boolean;
  readonly lead: string | null;
}

export function sublineOf(input: SublineInput): Subline {
  if (input.needsYou) return { kind: 'needs-you' };
  if (input.working) return { kind: 'working', step: input.step };
  if (input.waiting > 0) return { kind: 'waiting', count: input.waiting };
  if (input.queued > 0) return { kind: 'queued', count: input.queued };
  if (input.switching) return { kind: 'switching' };
  if (input.reconnecting) return { kind: 'reconnecting' };
  if (input.failed) return { kind: 'failed' };
  return input.lead === null ? { kind: 'none' } : { kind: 'lead', text: input.lead };
}

export function sublineText(line: Exclude<Subline, { readonly kind: 'working' | 'none' }>): string {
  switch (line.kind) {
    case 'needs-you':
      return 'Needs you';
    case 'waiting':
      return `${String(line.count)} waiting for connection`;
    case 'queued':
      return `Queued · ${String(line.count)}`;
    case 'switching':
      return 'Switching machine…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'failed':
      return 'Last reply failed';
    case 'lead':
      return line.text;
  }
}

export function queuedCount(rows: readonly Pick<AssistantMessageRow, 'role' | 'state'>[]): number {
  return rows.filter((row) => row.role === 'person' && row.state === 'queued').length;
}

export function lastReplyFailed(
  rows: readonly Pick<AssistantMessageRow, 'role' | 'state' | 'created_at'>[],
): boolean {
  let latest: Pick<AssistantMessageRow, 'state' | 'created_at'> | null = null;
  for (const row of rows) {
    if (row.role === 'responder' && (latest === null || row.created_at >= latest.created_at)) {
      latest = row;
    }
  }
  return latest?.state === 'failed';
}
