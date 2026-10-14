import type {
  AiChatRow,
  AiReference,
  AiReferenceKind,
  AiReferenceSearch,
  AiReferenceSourceStatus,
  AiReferenceSummary,
} from '@smarteverything/domain';
import type { ProjectAuthority } from '../projects/authority';
import type { Caller } from '../server/auth';

export interface ReferenceContext {
  readonly caller: Caller;
  readonly chat: AiChatRow;
  readonly authority: ProjectAuthority;
  readonly validate: () => void;
  readonly signal?: AbortSignal;
}
export interface ReferencePage {
  readonly items: readonly AiReferenceSummary[];
  readonly complete: boolean;
  readonly incomplete: boolean;
}
export interface ReferenceSearchProgress {
  readonly next: (context: ReferenceContext, limit: number) => Promise<ReferencePage>;
  readonly close: () => Promise<void>;
}
export interface ReferenceSource {
  readonly kind: AiReferenceKind;
  readonly status: (context: ReferenceContext) => AiReferenceSourceStatus;
  readonly open: (
    context: ReferenceContext,
    request: AiReferenceSearch,
  ) => Promise<ReferenceSearchProgress>;
  readonly resolve: (context: ReferenceContext, reference: AiReference) => Promise<AiReference>;
}
export interface ReferenceRuntime {
  readonly sources: readonly ReferenceSource[];
  readonly revision: (context: ReferenceContext) => string;
  readonly admit: (context: ReferenceContext, references: readonly AiReference[]) => Promise<void>;
}

export function emptyReferenceSearch(): ReferenceSearchProgress {
  return {
    next: (): Promise<ReferencePage> =>
      Promise.resolve({ items: [], complete: true, incomplete: false }),
    close: (): Promise<void> => Promise.resolve(),
  };
}
