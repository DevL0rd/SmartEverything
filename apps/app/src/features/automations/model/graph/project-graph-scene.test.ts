import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { ProgramV4 } from '@smarteverything/domain';
import {
  admitProgram,
  brokenProgram,
  decisionProgram,
  earlyEndProgram,
  failureProgram,
  forkProgram,
  gnode,
  guardProgram,
  idOf,
  ifNode,
  inputsProgram,
  automation,
  lastItemProgram,
  laneRowsProgram,
  loop,
  loopProgram,
  note,
  reading,
  start,
  switchProgram,
  tryProgram,
  unknownTargetProgram,
  wire,
} from './graph-scene-fixtures';
import { babyProgram } from './graph-baby-fixture';
import { projectGraphScene } from './project-graph-scene';
import {
  GRAPH_SCENE,
  type GraphScene,
  type GraphSceneEdge,
  type GraphSceneNode,
} from './scene-contract';

const LTR = { direction: 'ltr', kinds: STATIC_KIND_LOOKUP } as const;

function sceneOf(program: ProgramV4, direction: 'ltr' | 'ttb' = 'ltr'): GraphScene {
  return projectGraphScene(program, { direction, kinds: STATIC_KIND_LOOKUP });
}

function nodeOf(scene: GraphScene, key: string): GraphSceneNode {
  const found = scene.nodes.find((node) => node.key === key);
  if (found === undefined) throw new Error(`no scene node ${key}`);
  return found;
}

function rowOf(node: GraphSceneNode, port: string): GraphSceneNode['rows'][number] {
  const found = node.rows.find((row) => row.port === port);
  if (found === undefined) throw new Error(`no row ${port} on ${node.key}`);
  return found;
}

type End = readonly [node: string, handle: string];

function edgeBetween(scene: GraphScene, source: End, target: End): GraphSceneEdge | undefined {
  return scene.edges.find(
    (edge) =>
      edge.source.nodeId === idOf(source[0]) &&
      edge.source.handle === source[1] &&
      edge.target.nodeId === idOf(target[0]) &&
      edge.target.handle === target[1],
  );
}

describe('projectGraphScene contract', () => {
  it('produces data the contract accepts and rejects a stray field', () => {
    const programs = [decisionProgram(), loopProgram(), tryProgram(), forkProgram('all')];
    for (const program of programs) {
      const scene = sceneOf(program);
      expect(GRAPH_SCENE.safeParse(scene).success).toBe(true);
      expect(GRAPH_SCENE.safeParse({ ...scene, extra: 1 }).success).toBe(false);
    }
    const scene = sceneOf(decisionProgram());
    expect(GRAPH_SCENE.safeParse({ ...scene, version: 2 }).success).toBe(false);
  });

  it('orders triggers first, then Start, then the structured order', () => {
    const scene = sceneOf(decisionProgram());
    const keys = scene.nodes.map((node) => node.key);
    expect(keys.slice(0, 2)).toEqual(['tick', 'start']);
    expect(keys.indexOf('check')).toBeLessThan(keys.indexOf('lamp'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('takes sizes from the shared metrics and positions from the layout', () => {
    const scene = sceneOf(decisionProgram());
    const check = nodeOf(scene, 'check');
    expect(check.w).toBe(280);
    expect(check.family).toBe('decision');
    expect(scene.width).toBeGreaterThanOrEqual(Math.max(...scene.nodes.map((n) => n.x + n.w)));
  });

  it('shows the structured layout when the stored layout misses a card', () => {
    const program = decisionProgram();
    const stored = { nodes: { [idOf('check')]: { x: 900, y: 700 } }, frames: [], comments: [] };
    const scene = projectGraphScene(program, { ...LTR, layout: stored });
    const auto = nodeOf(sceneOf(program), 'check');
    expect(nodeOf(scene, 'check')).toMatchObject({ x: auto.x, y: auto.y });
  });

  it('passes the direction to the layout', () => {
    const across = sceneOf(decisionProgram(), 'ltr');
    const down = sceneOf(decisionProgram(), 'ttb');
    expect(across.direction).toBe('ltr');
    expect(down.direction).toBe('ttb');
    expect(nodeOf(across, 'after').x).toBeGreaterThan(nodeOf(across, 'check').x);
    expect(nodeOf(down, 'after').y).toBeGreaterThan(nodeOf(down, 'check').y);
    expect(nodeOf(down, 'after').x).toBeLessThan(nodeOf(across, 'after').x);
  });
});

describe('card families', () => {
  it('projects a decision with one condition pin and a row per branch', () => {
    const scene = sceneOf(decisionProgram());
    const check = nodeOf(scene, 'check');
    const row = rowOf(check, `row:${idOf('check:dark')}`);
    expect(row.handle).toBe(`x:row:${idOf('check:dark')}`);
    expect(row.role).toBe('branch');
    expect(row.condition).toMatchObject({
      handle: `v:row:${idOf('check:dark')}:when`,
      wired: true,
    });
    expect(rowOf(check, 'else')).toMatchObject({ handle: 'x:else', label: 'Otherwise' });
    expect(rowOf(check, 'else').condition).toBeNull();
    expect(check.execIn).toBe('x:in');
    const wired = edgeBetween(scene, ['sensor', 'o:value'], ['check', row.condition?.handle ?? '']);
    expect(wired).toMatchObject({ kind: 'value', state: 'normal' });
  });

  it('projects a switch with case rows and a default', () => {
    const check = nodeOf(sceneOf(switchProgram()), 'mode');
    const cases = check.rows.filter((row) => row.port.startsWith('case:'));
    expect(cases.map((row) => row.handle)).toEqual([
      `x:case:${idOf('mode:bright')}`,
      `x:case:${idOf('mode:dim')}`,
    ]);
    expect(rowOf(check, 'default').label).toBe('Default');
    expect(check.inputs.map((pin) => pin.handle)).toContain('v:subject');
  });

  it('projects a guard with Then and Otherwise and its condition as an input pin', () => {
    const scene = sceneOf(guardProgram());
    const only = nodeOf(scene, 'only');
    expect(only.family).toBe('decision');
    expect(only.rows.map((row) => row.handle)).toEqual(['x:next', 'x:otherwise']);
    expect(edgeBetween(scene, ['sensor', 'o:value'], ['only', 'v:condition'])).toBeDefined();
  });

  it('projects a fork and its join as a pair with the join option in the title', () => {
    const titles = {
      all: 'Wait for all',
      first: 'First to finish',
      settled: 'Wait for all, record each',
    };
    for (const [choice, title] of Object.entries(titles)) {
      const scene = sceneOf(forkProgram(choice));
      const both = nodeOf(scene, 'both');
      const meet = nodeOf(scene, 'meet');
      expect(both.family).toBe('fork');
      expect(meet.family).toBe('join');
      expect(meet.title).toBe(title);
      expect(both.pairIndex).toBe(0);
      expect(meet.pairIndex).toBe(0);
      expect(both.rows.map((row) => row.handle)).toEqual(['x:path:left', 'x:path:right']);
    }
  });

  it('shows a count on a merge input with more than one wire', () => {
    const scene = sceneOf(forkProgram('all'));
    expect(nodeOf(scene, 'meet').mergeCount).toBe(2);
    expect(nodeOf(scene, 'after').mergeCount).toBeNull();
    const merged = sceneOf(decisionProgram());
    expect(nodeOf(merged, 'after').mergeCount).toBe(2);
  });

  it('projects loop values as value outputs with their own handles', () => {
    const scene = sceneOf(lastItemProgram());
    const each = nodeOf(scene, 'each');
    expect(each.family).toBe('loop');
    expect(each.outputs.filter((pin) => pin.group === 'inside').map((pin) => pin.handle)).toEqual(
      expect.arrayContaining(['o:item', 'o:last', 'o:index']),
    );
    expect(rowOf(each, 'body').label).toBe('Each item');
    expect(rowOf(each, 'next').label).toBe('When done');
    expect(edgeBetween(scene, ['each', 'o:last'], ['show', 'v:message'])).toBeDefined();
  });

  it('keeps a loop reading its own value inside the card', () => {
    const scene = sceneOf(loopProgram());
    const each = nodeOf(scene, 'each');
    expect(each.inputs.find((pin) => pin.name === 'collect')).toMatchObject({ wired: true });
    expect(scene.edges.some((edge) => edge.source.nodeId === edge.target.nodeId)).toBe(false);
    expect(edgeBetween(scene, ['each', 'o:item'], ['show', 'v:message'])).toBeDefined();
  });

  it('projects a try with a catch row, finally and the error value', () => {
    const scene = sceneOf(tryProgram());
    const guarded = nodeOf(scene, 'guarded');
    expect(guarded.family).toBe('try');
    expect(guarded.rows.map((row) => row.handle)).toEqual([
      'x:try',
      `x:catch:${idOf('guarded:oops')}`,
      'x:finally',
      'x:next',
    ]);
    expect(guarded.outputs.find((pin) => pin.name === 'error')).toMatchObject({
      group: 'inside',
      shape: 'triangle',
    });
    expect(edgeBetween(scene, ['guarded', 'o:error'], ['tell', 'v:message'])).toBeDefined();
  });

  it('projects lane rows on waits with a timeout, routed steps and Set temporarily', () => {
    const scene = sceneOf(laneRowsProgram());
    expect(rowOf(nodeOf(scene, 'hold'), 'timedOut')).toMatchObject({
      role: 'lane',
      handle: 'x:timedOut',
    });
    expect(rowOf(nodeOf(scene, 'routed'), 'onError')).toMatchObject({
      role: 'lane',
      label: 'If it fails',
    });
    const temp = nodeOf(scene, 'temp');
    expect(temp.family).toBe('owner');
    expect(rowOf(temp, 'body')).toMatchObject({ role: 'lane', label: 'While' });
    expect(edgeBetween(scene, ['hold', 'x:timedOut'], ['late', 'x:in'])).toBeDefined();
  });

  it('draws terminals without exits and values as cards with outputs only', () => {
    const scene = sceneOf(automation([start('s'), gnode('s', 'flow.stop'), reading('sensor')]));
    expect(nodeOf(scene, 's')).toMatchObject({ family: 'terminal', rows: [], execIn: 'x:in' });
    const sensor = nodeOf(scene, 'sensor');
    expect(sensor).toMatchObject({ family: 'value', execIn: null, rows: [] });
    expect(sensor.outputs.map((pin) => pin.handle)).toContain('o:value');
  });

  it('gives a title from the label and a summary from the kind', () => {
    const labelled = automation([start('a'), note('a', undefined, { label: 'Tell everyone' })]);
    const scene = sceneOf(labelled);
    expect(nodeOf(scene, 'a').title).toBe('Tell everyone');
    expect(nodeOf(scene, 'a').summary).not.toBe('');
    expect(nodeOf(scene, 'start').title).toBe('Start');
    expect(nodeOf(scene, 'tick').family).toBe('trigger');
  });

  it('words wired values on the card the way the description strip does', () => {
    const scene = projectGraphScene(babyProgram(), {
      direction: 'ltr',
      kinds: STATIC_KIND_LOOKUP,
      names: () => 'Nursery lamp',
    });
    const card = (title: string): string =>
      scene.nodes.find((node) => node.title === title)?.summary ?? '';
    expect(card('Set Light')).toBe('Set power of the item from for each light to yes');
    expect(card('Set Nursery lamp')).toBe('Set brightness of Nursery lamp to level');
    expect(scene.nodes.map((node) => node.summary).join(' ')).not.toContain('›');
  });
});

describe('start, triggers and inputs', () => {
  it('wires every trigger into Start with a fixed wire and counts them', () => {
    const scene = sceneOf(admitProgram());
    const fixed = scene.edges.filter((edge) => edge.fixed);
    expect(fixed).toHaveLength(2);
    expect(fixed.every((edge) => edge.target.handle === 'x:in')).toBe(true);
    const begin = nodeOf(scene, 'start');
    expect(begin).toMatchObject({ family: 'start', execIn: 'x:in', mergeCount: 2 });
    expect(rowOf(nodeOf(scene, 'first'), 'next').label).toBe('Starts');
  });

  it('draws the admit condition as a pin on Start', () => {
    const scene = sceneOf(admitProgram());
    const admit = nodeOf(scene, 'start').inputs.find((pin) => pin.handle === 'v:admit');
    expect(admit).toMatchObject({ label: 'Only start if', wired: true });
    expect(edgeBetween(scene, ['sensor', 'o:value'], ['start', 'v:admit'])).toBeDefined();
  });

  it('draws program inputs as value outputs of Start and keeps the inputs root wire', () => {
    const scene = sceneOf(inputsProgram());
    const begin = nodeOf(scene, 'start');
    expect(begin.execIn).toBeNull();
    expect(begin.outputs.map((pin) => pin.handle)).toEqual(['o:level']);
    expect(edgeBetween(scene, ['start', 'o:level'], ['show', 'v:message'])).toBeDefined();
  });

  it('places the On failure card with its own exec row', () => {
    const scene = sceneOf(failureProgram());
    const failure = nodeOf(scene, 'failure');
    expect(failure).toMatchObject({ family: 'failure', execIn: null });
    expect(failure.rows.map((row) => row.handle)).toEqual(['x:next']);
  });
});

describe('end caps', () => {
  it('ends the top level with End and an early branch with End of run', () => {
    const scene = sceneOf(earlyEndProgram());
    expect(rowOf(nodeOf(scene, 'lamp'), 'next').endCap).toBe('End');
    expect(rowOf(nodeOf(scene, 'check'), 'else').endCap).toBe('End of run');
    expect(rowOf(nodeOf(scene, 'check'), `row:${idOf('check:dark')}`).endCap).toBeNull();
  });

  it('names where a lane returns to', () => {
    const inner = ifNode('inner', [{ name: 'on', to: 'x' }]);
    const each = loop(
      'each',
      'flow.for_each',
      { body: 'inner' },
      { ports: { items: { lit: [1] } } },
    );
    const repeat = loop('again', 'flow.repeat', { body: 'y' }, { ports: { times: { lit: 2 } } });
    const program: ProgramV4 = automation([
      start('each'),
      { ...each, to: { body: 'inner', next: 'again' } },
      inner,
      note('x'),
      repeat,
      note('y'),
    ]);
    const scene = sceneOf(program);
    expect(rowOf(nodeOf(scene, 'x'), 'next').endCap).toBe('next item');
    expect(rowOf(nodeOf(scene, 'inner'), 'else').endCap).toBe('End of this part');
    expect(rowOf(nodeOf(scene, 'y'), 'next').endCap).toBe('next pass');
    expect(rowOf(nodeOf(scene, 'again'), 'next').endCap).toBe('End');
  });

  it('names Try as the place a lane returns to and draws no cap on a wired or empty lane', () => {
    const scene = sceneOf(tryProgram());
    expect(rowOf(nodeOf(scene, 'risky'), 'next').endCap).toBe('back to Try');
    expect(rowOf(nodeOf(scene, 'tell'), 'next').endCap).toBe('back to Try');
    expect(rowOf(nodeOf(scene, 'after'), 'next').endCap).toBe('End');
    const empty = sceneOf(
      automation([
        start('each'),
        loop('each', 'flow.for_each', {}, { ports: { items: { lit: [1] } } }),
      ]),
    );
    expect(rowOf(nodeOf(empty, 'each'), 'body').endCap).toBeNull();
    expect(rowOf(nodeOf(empty, 'each'), 'body').wired).toBe(false);
  });
});

describe('problems', () => {
  it('puts a structure problem that carries a wire on that wire', () => {
    const scene = sceneOf(brokenProgram());
    const edge = scene.edges.find((item) => item.source.nodeId === idOf('a'));
    expect(edge).toMatchObject({ kind: 'exec', state: 'problem' });
    expect(edge?.message).toContain('Start');
    expect(scene.problems.map((problem) => problem.code)).toEqual(['exec_into_start']);
    expect(nodeOf(scene, 'a').problems).toEqual([]);
  });

  it('puts a wire problem whose wire has no edge on the node it starts at', () => {
    const scene = sceneOf(unknownTargetProgram());
    expect(scene.edges.filter((edge) => edge.state === 'problem')).toEqual([]);
    expect(nodeOf(scene, 'a').problems.map((problem) => problem.code)).toEqual(['unknown_target']);
  });

  it('lists a problem without a wire on the scene, also when its node could not be placed', () => {
    const cycle: ProgramV4 = automation([start('a'), note('a', 'b'), note('b', 'a')]);
    const scene = sceneOf(cycle);
    expect(scene.problems.map((problem) => problem.code)).toEqual(['wire_cycle']);
    const keys = new Set(scene.nodes.map((node) => node.id));
    expect(
      scene.edges.every((edge) => keys.has(edge.source.nodeId) && keys.has(edge.target.nodeId)),
    ).toBe(true);
  });

  it('puts a problem without a wire on its node when the node has a stored position', () => {
    const program = automation([start('a'), note('a'), note('orphan')]);
    const nodes = Object.fromEntries(
      ['tick', 'start', 'a', 'orphan'].map((key, index) => [idOf(key), { x: index * 300, y: 0 }]),
    );
    const scene = projectGraphScene(program, {
      ...LTR,
      layout: { nodes, frames: [], comments: [] },
    });
    expect(nodeOf(scene, 'orphan').problems.map((problem) => problem.code)).toEqual(['never_runs']);
    expect(scene.unplaced).toEqual([]);
  });
});

describe('pins', () => {
  it('declares a pin for a wired port that the kind does not list', () => {
    const odd = automation([
      start('a'),
      reading('sensor'),
      note('a', undefined, { ports: { message: { lit: 'x' }, extra: wire('sensor', 'value') } }),
    ]);
    const scene = sceneOf(odd);
    expect(nodeOf(scene, 'a').inputs.map((pin) => pin.handle)).toEqual(['v:message', 'v:extra']);
    expect(edgeBetween(scene, ['sensor', 'o:value'], ['a', 'v:extra'])).toBeDefined();
  });

  it('declares the outputs of a Custom Node call from the wires that read them', () => {
    const program = automation([
      start('call'),
      gnode('call', 'fn.call', { ports: { fn: { lit: idOf('fn') } }, to: { next: 'show' } }),
      note('show', undefined, { ports: { message: wire('call', 'result') } }),
    ]);
    const scene = sceneOf(program);
    expect(nodeOf(scene, 'call').outputs.map((pin) => pin.handle)).toEqual(['o:result']);
    expect(edgeBetween(scene, ['call', 'o:result'], ['show', 'v:message'])).toBeDefined();
  });

  it('ignores wires from the ambient roots', () => {
    const program = automation([
      start('a'),
      note('a', undefined, { ports: { message: wire('vars', 'count') } }),
    ]);
    const scene = sceneOf(program);
    expect(scene.edges.filter((edge) => edge.kind === 'value')).toEqual([]);
    expect(nodeOf(scene, 'a').inputs[0]).toMatchObject({ wired: true });
  });
});

describe('titles of Custom Node calls', () => {
  it('names a call after the Custom Node it runs unless the step has its own name', () => {
    const program = automation([
      start('a'),
      gnode('a', 'fn.call', { ports: { fn: { lit: 'f1' } }, to: { next: 'b' } }),
      gnode('b', 'fn.call', { ports: { fn: { lit: 'f1' } }, label: 'My name' }),
    ]);
    const scene = projectGraphScene(program, {
      direction: 'ltr',
      kinds: STATIC_KIND_LOOKUP,
      functions: new Map([['f1', { name: 'Dim gently' }]]),
    });
    expect(nodeOf(scene, 'a').title).toBe('Dim gently');
    expect(nodeOf(scene, 'b').title).toBe('My name');
  });
});
