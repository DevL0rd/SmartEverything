import type {
  AutomationV3,
  FlowNode,
  FunctionV3,
  GraphNode,
  ProgramV4,
  Scope,
} from '@smarteverything/domain';

export function treeOf(
  program: ProgramV4,
  body: Scope,
  onFailure: Scope | undefined,
): AutomationV3 | FunctionV3 {
  if (program.kind === 'function') {
    const { nodes: _nodes, version: _version, ...rest } = program;
    return { ...rest, version: 3, body };
  }
  const { nodes: _nodes, version: _version, ...rest } = program;
  return { ...rest, version: 3, body, ...(onFailure === undefined ? {} : { onFailure }) };
}

export function flowBase(node: GraphNode): FlowNode {
  const {
    to: _to,
    branches: _branches,
    cases: _cases,
    catches: _catches,
    paths: _paths,
    ...rest
  } = node;
  return rest;
}
