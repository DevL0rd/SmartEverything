import { FLOW_SCOPE_OUTPUTS, NODE_REGISTRY } from '@smarteverything/domain';
import type { LintContext } from '@smarteverything/flow/check/lint';

export const PREVIEW_LINT: LintContext = {
  kinds: (id) => NODE_REGISTRY.get(id),
  scopeOutputs: (kind) => FLOW_SCOPE_OUTPUTS[kind] ?? [],
  references: () => true,
  functions: () => undefined,
  secrets: new Set(),
  automations: () => undefined,
};
