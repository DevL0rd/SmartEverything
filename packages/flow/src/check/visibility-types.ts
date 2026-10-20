import type { NodeClass } from '@smarteverything/domain';
import type { ChildPart } from '../program/paths';
import type { PortReference } from './references';

export interface KindOutput {
  readonly name: string;
  readonly optional?: boolean | undefined;
}

export interface VisibilityKinds {
  readonly classOf: (kind: string) => NodeClass | undefined;
  readonly outputsOf: (kind: string) => readonly KindOutput[];
  readonly scopeOutputsOf?: (kind: string, part: ChildPart) => readonly string[];
}

export type VisibilityReason =
  | 'unknown_key'
  | 'self'
  | 'cycle'
  | 'comes_later'
  | 'inside_finished_container'
  | 'not_in_scope'
  | 'not_a_scope_output'
  | 'not_an_output'
  | 'pure_not_visible';

export type VisibilityVia =
  'reserved' | 'trigger' | 'scope_output' | 'before' | 'pure' | 'structured' | 'result';

export interface ReferenceOwner {
  readonly kind: 'node' | 'trigger' | 'program';
  readonly id?: string;
  readonly key?: string;
}

export interface ResolvedReference {
  readonly owner: ReferenceOwner;
  readonly reference: PortReference;
  readonly via: VisibilityVia;
  readonly optional: boolean;
}

export interface VisibilityProblem {
  readonly owner: ReferenceOwner;
  readonly reference: PortReference;
  readonly reason: VisibilityReason;
  readonly message: string;
}

export interface VisibilityReport {
  readonly problems: readonly VisibilityProblem[];
  readonly resolved: readonly ResolvedReference[];
}
