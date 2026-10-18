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
}
export interface ReferenceMatches {
  readonly items: readonly AiReferenceSummary[];
  readonly incomplete: boolean;
}
export interface NativeSearch {
  readonly sources: readonly AiReferenceSourceStatus[];
  readonly matches: ReferenceMatches;
}
export interface NativeReferences {
  readonly search: (
    context: ReferenceContext,
    request: AiReferenceSearch,
    kinds: readonly AiReferenceKind[],
  ) => Promise<NativeSearch>;
  readonly admit: (context: ReferenceContext, references: readonly AiReference[]) => Promise<void>;
}
