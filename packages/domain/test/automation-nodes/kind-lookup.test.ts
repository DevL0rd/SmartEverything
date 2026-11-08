import { describe, expect, it } from 'vitest';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import { ERROR_EXIT_PORT } from '../../src/automation-nodes/error-port';
import type { NodeKind } from '../../src/automation-nodes/define';
import {
  canRouteOnError,
  execClassOf,
  execPortsOf,
  fallibleOf,
  isExecNode,
} from '../../src/automation-nodes/exec-ports';
import { STATIC_KIND_LOOKUP, type NodeKindLookup } from '../../src/automation-nodes/kind-lookup';
import { graphRuleIssues, type GraphRuleProgram } from '../../src/automation-v3/graph-rules';
import type { GraphNode } from '../../src/automation-v3/graph';

const PLUGIN_ACTION = 'plugin.demo.ping';
const PLUGIN_READING = 'plugin.demo.reading';
const PLUGIN_SAFE = 'plugin.demo.note';

function core(id: string): NodeKind {
  const found = NODE_REGISTRY.get(id);
  if (found === undefined) throw new Error(`${id} is not a core kind`);
  return found;
}

const PLUGIN_KINDS: ReadonlyMap<string, NodeKind> = new Map([
  [PLUGIN_ACTION, { ...core('device.set'), id: PLUGIN_ACTION }],
  [PLUGIN_READING, { ...core('device.get'), id: PLUGIN_READING }],
  [PLUGIN_SAFE, { ...core('device.set'), id: PLUGIN_SAFE, fallible: false }],
]);

const WITH_PLUGINS: NodeKindLookup = {
  get: (id) => PLUGIN_KINDS.get(id) ?? NODE_REGISTRY.get(id),
  has: (id) => PLUGIN_KINDS.has(id) || NODE_REGISTRY.has(id),
};

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function node(n: number, key: string, kind: string, extra: Partial<GraphNode> = {}): GraphNode {
  return { id: id(n), key, kind, ...extra };
}

function program(nodes: readonly GraphNode[]): GraphRuleProgram {
  return {
    kind: 'automation',
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    policy: { mode: 'single' },
    nodes,
  };
}

function chain(middle: GraphNode): GraphRuleProgram {
  return program([
    node(1, 'begin', 'flow.start', { to: { next: middle.key } }),
    middle,
    node(3, 'finish', 'flow.stop'),
  ]);
}

describe('the default kind lookup is the static registry', () => {
  it('answers like the registry for every core kind', () => {
    for (const kind of ALL_NODE_KINDS) {
      expect(STATIC_KIND_LOOKUP.get(kind.id)).toBe(kind);
      expect(STATIC_KIND_LOOKUP.has(kind.id)).toBe(true);
      expect(execClassOf(kind.id, STATIC_KIND_LOOKUP)).toBe(
        execClassOf(kind.id, STATIC_KIND_LOOKUP),
      );
      expect(execPortsOf(kind.id, undefined, STATIC_KIND_LOOKUP)).toEqual(
        execPortsOf(kind.id, undefined, STATIC_KIND_LOOKUP),
      );
      expect(canRouteOnError(kind.id, STATIC_KIND_LOOKUP)).toBe(
        canRouteOnError(kind.id, STATIC_KIND_LOOKUP),
      );
      expect(fallibleOf(kind.id, STATIC_KIND_LOOKUP)).toBe(fallibleOf(kind.id, STATIC_KIND_LOOKUP));
    }
  });

  it('treats an unknown kind as a value with no exec ports', () => {
    expect(STATIC_KIND_LOOKUP.has(PLUGIN_ACTION)).toBe(false);
    expect(execClassOf(PLUGIN_ACTION, STATIC_KIND_LOOKUP)).toBe('value');
    expect(isExecNode(PLUGIN_ACTION, STATIC_KIND_LOOKUP)).toBe(false);
    expect(execPortsOf(PLUGIN_ACTION, undefined, STATIC_KIND_LOOKUP)).toEqual({
      input: false,
      outputs: [],
    });
    expect(fallibleOf(PLUGIN_ACTION, STATIC_KIND_LOOKUP)).toBe(false);
    expect(canRouteOnError(PLUGIN_ACTION, STATIC_KIND_LOOKUP)).toBe(false);
  });
});

describe('a lookup that knows plugin kinds', () => {
  it('classifies a plugin action as a step with a Then exit and an input', () => {
    expect(execClassOf(PLUGIN_ACTION, WITH_PLUGINS)).toBe('step');
    expect(isExecNode(PLUGIN_ACTION, WITH_PLUGINS)).toBe(true);
    const ports = execPortsOf(PLUGIN_ACTION, undefined, WITH_PLUGINS);
    expect(ports.input).toBe(true);
    expect(ports.outputs.map((out) => out.port)).toEqual(['next']);
  });

  it('keeps a plugin reading a value and routes errors only for fallible steps', () => {
    expect(execClassOf(PLUGIN_READING, WITH_PLUGINS)).toBe('value');
    expect(canRouteOnError(PLUGIN_ACTION, WITH_PLUGINS)).toBe(true);
    expect(canRouteOnError(PLUGIN_SAFE, WITH_PLUGINS)).toBe(false);
    expect(fallibleOf(PLUGIN_SAFE, WITH_PLUGINS)).toBe(false);
  });

  it('shows the error exit of a plugin step only when it is wired', () => {
    const wired = node(2, 'ping', PLUGIN_ACTION, {
      to: { next: 'finish', [ERROR_EXIT_PORT]: 'finish' },
    });
    const ports = execPortsOf(PLUGIN_ACTION, wired, WITH_PLUGINS).outputs.map((out) => out.port);
    expect(ports).toContain(ERROR_EXIT_PORT);
  });
});

describe('graph rules with a lookup', () => {
  const ping = (extra: Partial<GraphNode>): GraphNode => node(2, 'ping', PLUGIN_ACTION, extra);

  it('leaves plugin kinds unchecked under the static lookup', () => {
    expect(
      graphRuleIssues(chain(ping({ to: { next: 'finish', bogus: 'finish' } })), STATIC_KIND_LOOKUP),
    ).toEqual([]);
  });

  it('rejects an undeclared exit on a plugin kind the lookup knows', () => {
    const issues = graphRuleIssues(
      chain(ping({ to: { next: 'finish', bogus: 'finish' } })),
      WITH_PLUGINS,
    );
    expect(issues.map((found) => found.code)).toEqual(['undeclared_port']);
  });

  it('accepts a declared exit and an error exit on a fallible plugin step', () => {
    const issues = graphRuleIssues(
      chain(ping({ to: { next: 'finish', [ERROR_EXIT_PORT]: 'finish' } })),
      WITH_PLUGINS,
    );
    expect(issues).toEqual([]);
  });

  it('rejects an error exit on a plugin step that cannot fail', () => {
    const safe = node(2, 'note', PLUGIN_SAFE, {
      to: { next: 'finish', [ERROR_EXIT_PORT]: 'finish' },
    });
    const codes = graphRuleIssues(chain(safe), WITH_PLUGINS).map((found) => found.code);
    expect(codes).toContain('error_exit_on_infallible');
  });

  it('rejects wiring into a plugin value card', () => {
    const reading = node(4, 'reading', PLUGIN_READING);
    const begin = node(1, 'begin', 'flow.start', { to: { next: 'reading' } });
    const issues = graphRuleIssues(program([begin, reading]), WITH_PLUGINS);
    expect(issues.map((found) => found.code)).toContain('target_not_exec');
  });
});
