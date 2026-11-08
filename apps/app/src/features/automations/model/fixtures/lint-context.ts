import {
  FLOW_SCOPE_OUTPUTS,
  STATIC_KIND_LOOKUP,
  type NodeKindLookup,
} from '@smarteverything/domain';
import type { LintContext } from '@smarteverything/flow/check/lint';

export function previewLintOf(kinds: NodeKindLookup): LintContext {
  return {
    kinds: (id) => kinds.get(id),
    scopeOutputs: (kind) => FLOW_SCOPE_OUTPUTS[kind] ?? [],
    references: () => true,
    functions: () => undefined,
    secrets: new Set(),
    automations: () => undefined,
  };
}

export const PREVIEW_LINT: LintContext = previewLintOf(STATIC_KIND_LOOKUP);
