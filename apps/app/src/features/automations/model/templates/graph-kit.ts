import {
  graphKitOf,
  graphNodesOf,
  STATIC_KIND_LOOKUP,
  type AutomationV4,
  type GraphKit,
  type GraphPiece,
  type TriggerNode,
} from '@smarteverything/domain';
import { uuidOf, type Parts, type Ports } from './build';

export interface GraphMaker extends GraphKit {
  readonly trigger: (key: string, kind: string, ports?: Ports) => TriggerNode;
}

export interface GraphParts extends Omit<Parts, 'body'> {
  readonly body: readonly GraphPiece[];
}

export function graphMaker(seed: string): GraphMaker {
  let counter = 0;
  const nextId = (): string => {
    counter += 1;
    return uuidOf(`${seed}/${String(counter)}`);
  };
  const trigger: GraphMaker['trigger'] = (key, kind, ports) => ({
    id: nextId(),
    key,
    kind,
    ports: { ...ports },
  });
  return { ...graphKitOf(nextId, STATIC_KIND_LOOKUP), trigger };
}

export function graphAutomation(parts: GraphParts): AutomationV4 {
  return {
    version: 4,
    kind: 'automation',
    ...(parts.description === undefined ? {} : { description: parts.description }),
    triggers: [...parts.triggers],
    ...(parts.admit === undefined ? {} : { admit: parts.admit }),
    inputs: [],
    outputs: [],
    variables: [...(parts.variables ?? [])],
    nodes: graphNodesOf(
      parts.body,
      parts.triggers.map((entry) => entry.key),
    ),
    policy: { mode: parts.mode ?? 'single' },
  };
}
