import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { NODE_REGISTRY, type AutomationV4, type DescribeContext } from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { graphOutline } from '../../src/automations/service-programs-outline';
import { captureLogs } from '../support/logs';
import { graphAutomation } from './support/graph-of';
import {
  automationOf,
  lit,
  logLine,
  programRig,
  setPower,
  step,
  type ProgramRig,
} from './support/program-rig';

let rig: ProgramRig;

beforeEach(() => {
  captureLogs();
  rig = programRig();
});

afterEach(() => {
  rig.close();
});

const CONTEXT: DescribeContext = {
  kinds: (id: string) => NODE_REGISTRY.get(id),
  names: (): undefined => undefined,
};

function created(definition: AutomationV4): string {
  const result = rig.service.create(rig.owner.caller, { name: 'Graph', enabled: true, definition });
  if (result.id === null) throw new Error(`creating failed: ${result.summary}`);
  return result.id;
}

function withoutStartWire(program: AutomationV4): AutomationV4 {
  return {
    ...program,
    nodes: program.nodes.map((node) =>
      node.kind === 'flow.start' ? { id: node.id, key: node.key, kind: node.kind } : node,
    ),
  };
}

describe('layout completion at save', () => {
  it('gives every node a position when the program comes without a layout', () => {
    const id = created(automationOf([logLine('say', 'hi'), logLine('then', 'bye')]));
    const row = rig.programs.byId(id);
    for (const node of row.definition.nodes) expect(row.layout.nodes[node.id]).toBeDefined();
    expect(rig.revisions.byRevision(id, 1).layout).toStrictEqual(row.layout);
  });

  it('places a node added by a patch to the right of the step it follows', () => {
    const id = created(automationOf([logLine('say', 'hi')]));
    const result = rig.service.patch(rig.owner.caller, id, {
      expectedRevision: 1,
      ops: [
        {
          op: 'add',
          node: { key: 'two', kind: 'debug.log', ports: { message: lit('two') } },
          after: { key: 'say', port: 'next' },
        },
      ],
    });
    expect(result.ok).toBe(true);
    const { definition, layout } = rig.programs.byId(id);
    const say = definition.nodes.find((node) => node.key === 'say');
    const two = definition.nodes.find((node) => node.key === 'two');
    const sayAt = layout.nodes[say?.id ?? ''];
    const twoAt = layout.nodes[two?.id ?? ''];
    expect(twoAt).toBeDefined();
    expect(twoAt?.x ?? 0).toBeGreaterThan(sayAt?.x ?? 0);
  });

  it('keeps the positions the caller sent and fills only what is missing in a draft', () => {
    const id = created(automationOf([logLine('say', 'hi')]));
    const base = rig.programs.byId(id);
    const say = base.definition.nodes.find((node) => node.key === 'say');
    const more = { id: randomUUID(), key: 'more', kind: 'debug.log', ports: { message: lit('x') } };
    const program = {
      ...base.definition,
      nodes: base.definition.nodes.flatMap((node) =>
        node.key === 'say' ? [{ ...node, to: { next: 'more' } }, more] : [node],
      ),
    };
    const kept = { x: 4000, y: 7 };
    rig.service.saveDraft(id, {
      program,
      layout: { ...base.layout, nodes: { ...base.layout.nodes, [say?.id ?? '']: kept } },
      expectedRevision: 1,
    });
    const draft = rig.programs.byId(id).draft;
    expect(draft?.layout.nodes[say?.id ?? '']).toStrictEqual(kept);
    expect(draft?.layout.nodes[more.id]?.x ?? 0).toBeGreaterThan(kept.x);
  });
});

describe('a draft that does not structure', () => {
  it('is saved and names the graph problems, and publishing it is refused', () => {
    const id = created(automationOf([logLine('say', 'hi')]));
    const loose = withoutStartWire(automationOf([logLine('say', 'hi'), logLine('lost', 'x')]));
    const saved = rig.service.saveDraft(id, {
      program: loose,
      layout: rig.programs.byId(id).layout,
      expectedRevision: 1,
    });
    expect(saved.ok).toBe(true);
    expect(saved.problems).toContainEqual(
      expect.objectContaining({ code: 'never_runs', severity: 'error' }),
    );
    const published = rig.service.publish(rig.owner.caller, id, 1);
    expect(published.ok).toBe(false);
    expect(published.summary).toMatch(/^Refused/);
    expect(rig.programs.byId(id).revision).toBe(1);
  });

  it('is outlined in stored order under a heading that counts the problems', () => {
    const loose = withoutStartWire(automationOf([logLine('say', 'hi'), logLine('lost', 'x')]));
    const lines = graphOutline(loose, CONTEXT, STATIC_KIND_LOOKUP).split('\n');
    expect(lines[0]).toMatch(/^Not a valid graph yet: 2 problems$/);
    const keys = lines.filter((line) => /^(start|say|lost) · /.test(line));
    expect(keys.map((line) => line.split(' · ')[0])).toStrictEqual(['start', 'say', 'lost']);
  });
});

describe('the outline of a valid graph', () => {
  it('shows the wires of every step in structured order', () => {
    const program = graphAutomation(
      {
        version: 3,
        kind: 'automation',
        triggers: [],
        inputs: [],
        outputs: [],
        variables: [],
        policy: { mode: 'single' },
        body: {
          nodes: [
            setPower('turn_on', randomUUID()),
            step(
              'if_dark',
              'flow.if',
              {},
              {
                branches: [
                  {
                    id: randomUUID(),
                    when: lit(true),
                    scope: { nodes: [logLine('lights_on', 'on')] },
                  },
                ],
                scopes: { else: { nodes: [logLine('notify', 'off')] } },
              },
            ),
          ],
        },
      },
      STATIC_KIND_LOOKUP,
    );
    const text = graphOutline(program, CONTEXT, STATIC_KIND_LOOKUP);
    expect(text).toMatch(/^start · .* → then turn_on$/m);
    expect(text).toMatch(/^turn_on · .* → then if_dark$/m);
    expect(text).toMatch(/^if_dark · .* · if\(.*\) → lights_on · otherwise → notify$/m);
    expect(text).toMatch(/^lights_on · .* → then end$/m);
    expect(text).not.toMatch(/Not a valid graph/);
  });
});
