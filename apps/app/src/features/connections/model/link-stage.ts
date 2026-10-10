import type {
  ProviderLinkRow,
  ProviderPhase,
  ProviderProblem,
  ProviderPrompt,
} from '@smarteverything/domain';

export type LinkStage =
  | { readonly kind: 'form' }
  | { readonly kind: 'working'; readonly phase: ProviderPhase }
  | { readonly kind: 'prompt'; readonly prompt: ProviderPrompt }
  | { readonly kind: 'done'; readonly row: ProviderLinkRow }
  | {
      readonly kind: 'failed';
      readonly problem: ProviderProblem;
      readonly detail: string | null;
    };

export interface SentLink {
  readonly baseline: string | null;
}

function liveStage(row: ProviderLinkRow): LinkStage {
  if (row.prompt !== null) {
    return { kind: 'prompt', prompt: row.prompt };
  }
  switch (row.status) {
    case 'linking':
      return { kind: 'working', phase: row.phase ?? 'signing_in' };
    case 'linked':
      return { kind: 'done', row };
    case 'unlinked':
    case 'needs_attention':
      return { kind: 'failed', problem: row.problem ?? 'unknown', detail: row.last_error };
  }
}

export function stageOf(row: ProviderLinkRow | null, sent: SentLink | null): LinkStage {
  if (sent === null) {
    return row?.status === 'linking' ? liveStage(row) : { kind: 'form' };
  }
  if (row === null || row.updated_at === sent.baseline) {
    return { kind: 'working', phase: 'signing_in' };
  }
  return liveStage(row);
}

export function inProgress(stage: LinkStage): boolean {
  return stage.kind === 'working' || stage.kind === 'prompt';
}

const PHASE_INDEX: Readonly<Record<ProviderPhase, number>> = {
  signing_in: 0,
  awaiting_answer: 1,
  discovering: 2,
};

export function stepIndexOf(stage: LinkStage): number {
  switch (stage.kind) {
    case 'form':
      return -1;
    case 'working':
      return PHASE_INDEX[stage.phase];
    case 'prompt':
      return 1;
    case 'done':
    case 'failed':
      return 3;
  }
}
