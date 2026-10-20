import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { FlowNode } from '../../src/automation-v3/node';
import {
  AUTOMATION_V3,
  FUNCTION_V3,
  type AutomationV3,
  type FunctionV3,
} from '../../src/automation-v3/program';
import {
  STATEFUL_KIND_IDS,
  structuralIssues,
  type StructuredProgram,
} from '../../src/automation-v3/structure-rules';
import {
  AUTOMATION_DEFECTS,
  FUNCTION_DEFECTS,
  automationV3,
  functionV3,
  invalidAutomation,
  invalidFunction,
} from '../support/automation-v3-arbitraries';

const ID_A = '00000000-0000-4000-8000-00000000000a';
const ID_B = '00000000-0000-4000-8000-00000000000b';
const ID_C = '00000000-0000-4000-8000-00000000000c';
const ID_D = '00000000-0000-4000-8000-00000000000d';

const automation: AutomationV3 = {
  version: 3,
  kind: 'automation',
  triggers: [],
  inputs: [],
  outputs: [],
  variables: [],
  body: { nodes: [] },
  policy: { mode: 'single' },
};

const fn: FunctionV3 = {
  version: 3,
  kind: 'function',
  flavour: 'action',
  inputs: [],
  outputs: [],
  exits: ['done'],
  variables: [],
  body: { nodes: [] },
};

const trigger = { id: ID_D, key: 'press', kind: 'trigger.button', ports: {} };

function messages(program: StructuredProgram): readonly string[] {
  return structuralIssues(program).map((issue) => issue.message);
}

describe('structural rules over generated programs', () => {
  it('accept every valid automation and function', () => {
    fc.assert(
      fc.property(automationV3, (program) => {
        expect(structuralIssues(program)).toEqual([]);
      }),
    );
    fc.assert(
      fc.property(functionV3, (program) => {
        expect(structuralIssues(program)).toEqual([]);
      }),
    );
  });

  it('refuse every injected defect with its reason', () => {
    fc.assert(
      fc.property(invalidAutomation, ({ defect, program }) => {
        const result = AUTOMATION_V3.safeParse(program);
        expect(result.success).toBe(false);
        expect(messages(program).some((text) => text.includes(defect.message))).toBe(true);
      }),
    );
    fc.assert(
      fc.property(invalidFunction, ({ defect, program }) => {
        expect(FUNCTION_V3.safeParse(program).success).toBe(false);
        expect(messages(program).some((text) => text.includes(defect.message))).toBe(true);
      }),
    );
  });

  it('refuses each defect on a bare program', () => {
    for (const defect of AUTOMATION_DEFECTS) {
      expect(
        messages(defect.apply(automation)).some((text) => text.includes(defect.message)),
        defect.name,
      ).toBe(true);
    }
    for (const defect of FUNCTION_DEFECTS) {
      expect(
        messages(defect.apply(fn)).some((text) => text.includes(defect.message)),
        defect.name,
      ).toBe(true);
    }
  });
});

describe('identity rules', () => {
  const node = (id: string, key: string, kind = 'device.set'): FlowNode => ({ id, key, kind });

  it('flags a node id reused inside a branch and the path of the second use', () => {
    const program: AutomationV3 = {
      ...automation,
      body: {
        nodes: [
          node(ID_A, 'a'),
          {
            ...node(ID_B, 'b', 'flow.if'),
            branches: [{ id: ID_C, when: { lit: true }, scope: { nodes: [node(ID_A, 'c')] } }],
          },
        ],
      },
    };
    const issues = structuralIssues(program);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual(['body', 'nodes', 1, 'branches', 0, 'scope', 'nodes', 0, 'id']);
  });

  it('flags a row id that repeats a node id, across switch and catch rows', () => {
    const program: AutomationV3 = {
      ...automation,
      body: {
        nodes: [
          {
            ...node(ID_A, 'a', 'flow.switch'),
            cases: [{ id: ID_B, match: { eq: 1 }, scope: { nodes: [] } }],
          },
          {
            ...node(ID_B, 'b', 'flow.try'),
            scopes: { try: { nodes: [] } },
            catches: [{ id: ID_A, scope: { nodes: [] } }],
          },
        ],
      },
    };
    expect(messages(program)).toHaveLength(2);
  });

  it('flags a node key that repeats a trigger key and a nested key in onFailure', () => {
    const program: AutomationV3 = {
      ...automation,
      triggers: [trigger],
      body: { nodes: [node(ID_A, 'press')] },
      onFailure: { nodes: [node(ID_B, 'press')] },
    };
    const issues = structuralIssues(program);
    expect(issues.map((issue) => issue.path)).toEqual([
      ['body', 'nodes', 0, 'key'],
      ['onFailure', 'nodes', 0, 'key'],
    ]);
  });

  it('flags a trigger id used twice', () => {
    const program: AutomationV3 = {
      ...automation,
      triggers: [trigger, { ...trigger, key: 'other' }],
    };
    expect(structuralIssues(program).map((issue) => issue.path)).toEqual([['triggers', 1, 'id']]);
  });

  it('flags repeated input, output and variable names', () => {
    const port = { name: 'a', type: { t: 'text' } as const };
    const program: AutomationV3 = {
      ...automation,
      inputs: [
        { ...port, required: false },
        { ...port, required: false },
      ],
      outputs: [port, port],
      variables: [
        { name: 'v', type: { t: 'text' }, initial: { lit: '' } },
        { name: 'v', type: { t: 'text' }, initial: { lit: '' } },
      ],
    };
    expect(messages(program)).toEqual([
      'input "a" is used more than once',
      'output "a" is used more than once',
      'variable "v" is used more than once',
    ]);
  });
});

describe('shape rules', () => {
  const body = { nodes: [] };

  it('checks a switch needs its cases and an if its branches', () => {
    const program: AutomationV3 = {
      ...automation,
      body: { nodes: [{ id: ID_A, key: 'a', kind: 'flow.switch' }] },
    };
    expect(messages(program)).toEqual(['cases belong to flow.switch and flow.switch needs them']);
  });

  it('accepts the declared scopes of every container family', () => {
    const nodes = [
      { id: ID_A, key: 'a', kind: 'flow.try', scopes: { try: body, finally: body } },
      { id: ID_B, key: 'b', kind: 'flow.while', scopes: { body } },
      {
        id: ID_C,
        key: 'c',
        kind: 'flow.parallel',
        scopes: { left: body, right: body, onError: body },
        policy: { onError: 'route' as const },
      },
    ];
    expect(structuralIssues({ ...automation, body: { nodes } })).toEqual([]);
  });

  it('reports a scope that the container does not declare', () => {
    const program: AutomationV3 = {
      ...automation,
      body: {
        nodes: [
          { id: ID_A, key: 'a', kind: 'flow.switch', cases: [], scopes: { else: body } },
          {
            id: ID_B,
            key: 'b',
            kind: 'flow.if',
            branches: [{ id: ID_C, when: { lit: true }, scope: body }],
            scopes: { else: body, default: body },
          },
        ],
      },
    };
    expect(structuralIssues(program).map((issue) => issue.path)).toEqual([
      ['body', 'nodes', 0, 'scopes', 'else'],
      ['body', 'nodes', 1, 'scopes', 'default'],
    ]);
  });

  it('does not check scope names of kinds it does not know', () => {
    const program: AutomationV3 = {
      ...automation,
      body: {
        nodes: [{ id: ID_A, key: 'a', kind: 'device.set_temporarily', scopes: { ended: body } }],
      },
    };
    expect(structuralIssues(program)).toEqual([]);
  });

  it('allows a pin on a function instance and structured outputs on an if', () => {
    const program: AutomationV3 = {
      ...automation,
      body: {
        nodes: [
          { id: ID_A, key: 'a', kind: 'fn.call', pin: { revision: 2 } },
          {
            id: ID_B,
            key: 'b',
            kind: 'flow.if',
            branches: [{ id: ID_C, when: { lit: true }, scope: body }],
            outputs: [{ name: 'out', values: { else: { lit: 1 } } }],
          },
        ],
      },
    };
    expect(structuralIssues(program)).toEqual([]);
  });
});

describe('policy, variable and input rules', () => {
  it('allows max on queue and parallel and maxWait on queue', () => {
    expect(
      structuralIssues({ ...automation, policy: { mode: 'queue', max: 3, maxWait: 5 } }),
    ).toEqual([]);
    expect(structuralIssues({ ...automation, policy: { mode: 'parallel', max: 3 } })).toEqual([]);
    expect(structuralIssues({ ...automation, policy: { mode: 'restart' } })).toEqual([]);
  });

  it('refuses max and maxWait on restart', () => {
    expect(messages({ ...automation, policy: { mode: 'restart', max: 1, maxWait: 1 } })).toEqual([
      'max belongs to the queue and parallel modes',
      'maxWait belongs to the queue mode',
    ]);
  });

  it('keeps persistent variables on automations and kept data on action Custom Nodes', () => {
    const variables = [
      { name: 'kept', type: { t: 'number' } as const, initial: { lit: 0 }, persist: true },
    ];
    expect(structuralIssues({ ...automation, variables })).toEqual([]);
    expect(structuralIssues({ ...fn, variables })).toEqual([]);
    expect(messages({ ...fn, flavour: 'pure', variables })).toEqual([
      'only an action Custom Node can keep data between runs',
    ]);
  });

  it('asks for a default only on required inputs of triggered automations', () => {
    const required = { name: 'needed', type: { t: 'number' } as const, required: true };
    expect(structuralIssues({ ...automation, inputs: [required] })).toEqual([]);
    expect(
      structuralIssues({ ...automation, triggers: [trigger], inputs: [required] }),
    ).toHaveLength(1);
    expect(
      structuralIssues({
        ...automation,
        triggers: [trigger],
        inputs: [{ ...required, default: 3 }],
      }),
    ).toEqual([]);
    expect(
      structuralIssues({
        ...automation,
        triggers: [trigger],
        inputs: [{ ...required, required: false }],
      }),
    ).toEqual([]);
    expect(structuralIssues({ ...fn, inputs: [required] })).toEqual([]);
  });

  it('lets an automation hold stateful nodes but not a function', () => {
    const nodes = [...STATEFUL_KIND_IDS].map((kind, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
      key: `s${String(index)}`,
      kind,
    }));
    expect(structuralIssues({ ...automation, body: { nodes } })).toEqual([]);
    expect(structuralIssues({ ...fn, body: { nodes } })).toHaveLength(nodes.length);
  });
});

describe('rules inside the schemas', () => {
  it('carries the path and message of each issue into the parse result', () => {
    const result = AUTOMATION_V3.safeParse({ ...automation, policy: { mode: 'single', max: 2 } });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ['policy', 'max'],
      message: 'max belongs to the queue and parallel modes',
    });
  });
});
