import {
  AUTOMATION_FUNCTION_ENDPOINTS,
  FUNCTION_V3,
  type FunctionV3,
} from '@smarteverything/domain';
import { DEFAULT_EXIT } from '@smarteverything/flow/extract/control';
import type { FunctionCreateBody } from '../../data/api';

export const FUNCTION_NAME = AUTOMATION_FUNCTION_ENDPOINTS.createAutomationFunction.body.shape.name;

export type NewNodeKind = 'step' | 'value';

export interface KindOption {
  readonly value: NewNodeKind;
  readonly label: string;
  readonly explanation: string;
}

export const KIND_OPTIONS: readonly KindOption[] = [
  {
    value: 'step',
    label: 'Step node',
    explanation: 'Runs steps. It can change things or wait, and is used as a step.',
  },
  {
    value: 'value',
    label: 'Value node',
    explanation: 'Only works out a value from its inputs, with no effects.',
  },
];

export function emptyFunction(kind: NewNodeKind, newId: () => string): FunctionV3 {
  return FUNCTION_V3.parse({
    version: 3,
    kind: 'function',
    flavour: kind === 'value' ? 'pure' : 'action',
    inputs: [],
    outputs: [],
    exits: [DEFAULT_EXIT],
    variables: [],
    body: {
      nodes: [
        {
          id: newId(),
          key: 'finish',
          kind: 'flow.return',
          ports: { exit: { lit: DEFAULT_EXIT } },
        },
      ],
    },
  });
}

export function nameIssue(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Give the Custom Node a name.';
  return FUNCTION_NAME.safeParse(trimmed).success ? null : 'That name is too long.';
}

export function newNodeRequest(
  name: string,
  kind: NewNodeKind,
  newId: () => string = () => globalThis.crypto.randomUUID(),
): FunctionCreateBody {
  return { name: name.trim(), definition: emptyFunction(kind, newId) };
}
