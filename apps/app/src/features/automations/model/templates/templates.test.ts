import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import {
  AUTOMATION_V3,
  AUTOMATION_V4,
  FLOW_SCOPE_OUTPUTS,
  NODE_REGISTRY,
  STARTER_NODES,
  STARTER_NODE_IDS,
  type AutomationV3,
  type FlowNode,
} from '@smarteverything/domain';
import type { LintContext } from '@smarteverything/flow/check/lint';
import { lint } from '@smarteverything/flow/check/lint';
import { structuredOf } from '@smarteverything/flow/graph/structured-of';
import { describe, expect, it } from 'vitest';
import { templatesFor } from './all-templates';
import { automation } from './build';
import { clockOf, clockText, previewLines } from './preview';
import { snippetsFor } from './snippets';
import { templateTree } from './structured';
import { takenStates, unusedTemplates } from './taken';
import { APPLIANCES, HOME, ROOMS } from './template-fixtures';

function context(): LintContext {
  const starters = new Map(
    STARTER_NODES.flatMap((entry) => {
      const structured = structuredOf(entry.program, STATIC_KIND_LOOKUP);
      return structured.kind === 'structured' && structured.tree.kind === 'function'
        ? [[entry.id, structured.tree] as const]
        : [];
    }),
  );
  return {
    kinds: (id) => NODE_REGISTRY.get(id),
    scopeOutputs: (kind) => FLOW_SCOPE_OUTPUTS[kind] ?? [],
    references: () => true,
    functions: (id) => starters.get(id),
    secrets: new Set(),
    automations: () => undefined,
  };
}

const DEVICES = [...HOME, ...APPLIANCES];

const FEATURES = new Map([['desk', ['audio', 'brightness', 'night_light'] as const]]);

const ALL = templatesFor(DEVICES, {
  rooms: ROOMS,
  people: [{ id: 'sam', name: 'Sam' }],
  computerFeatures: FEATURES,
});

function errorsOf(program: AutomationV3): string[] {
  return lint(program, context())
    .filter((found) => found.severity === 'error')
    .map((found) => `${found.code}: ${found.message}`);
}

function nodesOf(program: AutomationV3): FlowNode[] {
  const walk = (nodes: readonly FlowNode[]): FlowNode[] =>
    nodes.flatMap((node) => [
      node,
      ...walk(Object.values(node.scopes ?? {}).flatMap((scope) => scope.nodes)),
      ...walk((node.branches ?? []).flatMap((branch) => branch.scope.nodes)),
      ...walk((node.catches ?? []).flatMap((row) => row.scope.nodes)),
    ]);
  return walk(program.body.nodes);
}

function find(id: string): AutomationV3 {
  const found = ALL.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no template ${id}`);
  return templateTree(found, undefined, STATIC_KIND_LOOKUP);
}

describe('every template', () => {
  it('is a valid program that checks without errors', () => {
    for (const entry of ALL) {
      expect(AUTOMATION_V4.safeParse(entry.build()).success, entry.id).toBe(true);
      expect(errorsOf(templateTree(entry, undefined, STATIC_KIND_LOOKUP)), entry.id).toEqual([]);
    }
  });

  it('has a unique id, a unique name and unique node ids', () => {
    expect(new Set(ALL.map((entry) => entry.id)).size).toBe(ALL.length);
    expect(new Set(ALL.map((entry) => entry.name.toLowerCase())).size).toBe(ALL.length);
    for (const entry of ALL) {
      const program = templateTree(entry, undefined, STATIC_KIND_LOOKUP);
      const ids = [...program.triggers, ...nodesOf(program)].map((node) => node.id);
      expect(new Set(ids).size, entry.id).toBe(ids.length);
    }
  });

  it('builds the same program every time', () => {
    for (const entry of ALL) expect(entry.build()).toEqual(entry.build());
  });

  it('keeps the ids of the ideas it replaces', () => {
    const ids = ALL.map((entry) => entry.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'bedtime:purifier',
        'air:air',
        'dry:humid',
        'person:cam',
        'sunset-lights',
        'leak:leaky',
        'smoke:smoky',
        'night:motion',
        'microwave-ready:microwave',
        'microwave-inside:microwave',
        'weigh-in:scale',
        'adguard-off:adguard',
        'sync-error:sync',
        'button:button',
        'treadmill-finished:treadmill',
        'treadmill-steep:treadmill',
        'treadmill-lock:treadmill',
        'treadmill-reminder:treadmill',
        'bottle-afternoon:bottle',
        'bottle-bedtime:bottle',
        'bottle-fault:bottle',
        'brush-light:brush',
        'brush-battery:brush',
        'brush-head-due:brush',
        'printer-low:printer',
        'printer-offline:printer',
        'computer-quiet:desk',
        'computer-dim:desk',
        'computer-warm:desk',
        'app-opened:desk',
        'sleep-ended',
        'reply-failed',
      ]),
    );
  });
});

describe('the new and changed ideas', () => {
  it('hands off after a manual change with a physical-cause device trigger', () => {
    const program = find('hands-off');
    expect(program.triggers.map((node) => node.kind)).toEqual(['trigger.device']);
    expect(program.triggers[0]?.ports).toMatchObject({
      room: { lit: 'room-living' },
      cause: { lit: 'physical' },
      family: { lit: 'light' },
    });
    expect(program.variables).toEqual([expect.objectContaining({ name: 'autoOn', persist: true })]);
    expect(nodesOf(program)[0]).toMatchObject({
      kind: 'var.set',
      ports: { name: { lit: 'autoOn' }, to: { lit: false } },
    });
  });

  it('keeps the purifier on and off with the two-threshold node', () => {
    const kinds = nodesOf(find('air:air')).map((node) => node.kind);
    expect(kinds).toContain('timing.hysteresis');
    expect(kinds.filter((kind) => kind === 'device.set')).toHaveLength(2);
    expect(kinds).not.toContain('fn.call');
  });

  it('uses the starter Custom Nodes where they fit', () => {
    const called = ALL.flatMap((entry) =>
      nodesOf(templateTree(entry, undefined, STATIC_KIND_LOOKUP)),
    )
      .filter((node) => node.kind === 'fn.call')
      .map((node) => node.ports?.['fn']);
    expect(called).toContainEqual({ lit: STARTER_NODE_IDS.lightsOffAfter });
    expect(called).toContainEqual({ lit: STARTER_NODE_IDS.switchDevices });
  });

  it('offers a Learn example for each new construct', () => {
    const learn = ALL.filter((entry) => entry.category === 'learn');
    const kinds = new Set(
      learn.flatMap((entry) =>
        nodesOf(templateTree(entry, undefined, STATIC_KIND_LOOKUP)).map((node) => node.kind),
      ),
    );
    for (const kind of ['flow.for_each', 'flow.while', 'flow.try', 'flow.parallel', 'fn.call']) {
      expect(kinds.has(kind), kind).toBe(true);
    }
  });

  it('checks a time window and a device reading before it acts', () => {
    expect(nodesOf(find('night:motion')).map((node) => node.kind)).toEqual([
      'logic.time_window',
      'flow.guard',
      'device.set',
    ]);
    expect(nodesOf(find('microwave-inside:microwave')).map((node) => node.kind)).toEqual([
      'device.get',
      'logic.compare',
      'flow.guard',
      'notify.feed',
    ]);
  });
});

describe('the v1.1 trigger ideas', () => {
  it('use the computer, health and chat triggers', () => {
    expect(find('app-opened:desk').triggers[0]).toMatchObject({
      kind: 'trigger.computer',
      ports: { computer: { lit: 'desk' }, kind: { lit: 'app_open' }, app: { lit: 'Steam' } },
    });
    expect(find('sleep-ended').triggers[0]?.kind).toBe('trigger.health');
    expect(find('reply-failed').triggers[0]).toMatchObject({
      kind: 'trigger.chat',
      ports: { outcome: { lit: 'failed' } },
    });
  });
});

describe('filling a template', () => {
  it('writes the chosen values into the program', () => {
    const entry = ALL.find((candidate) => candidate.id === 'sunset-lights');
    if (entry === undefined) throw new Error('no sunset template');
    const program = templateTree(entry, { lights: ['lamp2'], offset: -30 }, STATIC_KIND_LOOKUP);
    expect(program.triggers[0]?.ports).toMatchObject({ offset: { lit: -1_800_000 } });
    expect(nodesOf(program)[0]?.ports?.['target']).toEqual({ lit: { devices: ['lamp2'] } });
  });

  it('offers a slot with the home defaults for every choice', () => {
    for (const entry of ALL) {
      for (const slot of entry.slots) {
        if (slot.choices === undefined) continue;
        const values = [slot.value].flat();
        const known: unknown[] = slot.choices.map((choice) => choice.value);
        for (const value of values) expect(known, `${entry.id}.${slot.name}`).toContain(value);
      }
    }
  });

  it('refuses a value of the wrong kind', () => {
    const entry = ALL.find((candidate) => candidate.id === 'weigh-in:scale');
    expect(() => entry?.build({ at: 7 })).toThrow('not text');
  });
});

describe('snippets', () => {
  const snippets = snippetsFor(DEVICES);

  it('offers the four fragments', () => {
    expect(snippets.map((entry) => entry.id)).toEqual([
      'snippet:retry-3',
      'snippet:speak-or-push',
      'snippet:lights-off-after-no-motion',
      'snippet:wait-for-the-door',
    ]);
  });

  it('check as the body of an automation', () => {
    for (const entry of snippets) {
      const program = automation({
        triggers: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            key: 'time1',
            kind: 'trigger.time',
            ports: { at: { lit: '07:00' } },
          },
        ],
        body: entry.build(),
      });
      expect(AUTOMATION_V3.safeParse(program).success, entry.id).toBe(true);
      expect(errorsOf(program), entry.id).toEqual([]);
    }
  });

  it('retries three times', () => {
    const [node] = snippets[0]?.build() ?? [];
    expect(node?.policy?.retry?.attempts).toBe(3);
  });
});

describe('already created ideas', () => {
  it('are marked by the automation name, ignoring case', () => {
    const left = unusedTemplates(ALL, ['LIGHTS ON AT SUNSET']);
    expect(left.some((entry) => entry.id === 'sunset-lights')).toBe(false);
    expect(left).toHaveLength(ALL.length - 1);
  });

  it('give back the existing automation and whether it is on', () => {
    const states = takenStates(ALL, [
      { id: 'row-1', name: 'press · kitchen switch', enabled: false },
    ]);
    const at = ALL.findIndex((entry) => entry.id === 'button:button');
    expect(states[at]).toEqual({ id: 'row-1', enabled: false });
    expect(states.filter((state) => state !== null)).toHaveLength(1);
  });
});

describe('previews', () => {
  const names = (kind: string, id: string): string | undefined =>
    kind === 'device' ? id : undefined;

  it('read like a short outline of the program', () => {
    const lines = ALL.filter((candidate) => candidate.id === 'sunset-lights').flatMap((entry) =>
      previewLines(entry, names, NODE_REGISTRY),
    );
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines[0]?.startsWith('When ')).toBe(true);
  });

  it('stay within five lines for every template', () => {
    for (const entry of ALL) {
      const lines = previewLines(entry, names, NODE_REGISTRY);
      expect(lines.length, entry.id).toBeGreaterThan(0);
      expect(lines.length, entry.id).toBeLessThanOrEqual(5);
    }
  });

  it('turn a time slot into a clock and back', () => {
    expect(clockOf('07:05')).toEqual({ hour: 7, minute: 5 });
    expect(clockOf('7:5')).toBeNull();
    expect(clockText({ hour: 7, minute: 5 })).toBe('07:05');
  });
});

describe('the routine templates that call starter Custom Nodes', () => {
  function callOf(program: AutomationV3): FlowNode {
    const call = nodesOf(program).find((node) => node.kind === 'fn.call');
    if (call === undefined) throw new Error('no Custom Node call');
    return call;
  }

  it('wakes the lights with a sunrise of the chosen length', () => {
    const program = find('wake-up-light');
    expect(program.triggers[0]).toMatchObject({
      kind: 'trigger.time',
      ports: { at: { lit: '06:30' } },
    });
    expect(callOf(program).ports).toMatchObject({
      fn: { lit: STARTER_NODE_IDS.wakeUpLight },
      over: { lit: 15 * 60_000 },
    });
  });

  it('flashes the lights when the camera sees the doorbell', () => {
    const program = find('doorbell-flash:cam');
    expect(program.triggers[0]).toMatchObject({
      kind: 'trigger.camera',
      ports: { camera: { lit: 'cam' }, detection: { lit: 'doorbell' } },
    });
    expect(callOf(program).ports).toMatchObject({
      fn: { lit: STARTER_NODE_IDS.flashTheLights },
      times: { lit: 3 },
    });
  });

  it('checks the house when the last person leaves', () => {
    const program = find('leave-home-check');
    expect(program.triggers[0]).toMatchObject({
      kind: 'trigger.presence',
      ports: { event: { lit: 'left' }, when: { lit: 'everyone_left' } },
    });
    expect(callOf(program).ports).toMatchObject({
      fn: { lit: STARTER_NODE_IDS.leaveHomeCheck },
      people: { lit: ['sam'] },
      openings: { lit: { devices: ['door'] } },
    });
  });

  it('offers no leave home check when nobody can be told', () => {
    expect(templatesFor(DEVICES).some((entry) => entry.id === 'leave-home-check')).toBe(false);
  });
});
