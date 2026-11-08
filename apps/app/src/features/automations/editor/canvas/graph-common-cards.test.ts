import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { ProgramV4 } from '@smarteverything/domain';
import {
  admitProgram,
  automation,
  decisionProgram,
  failureProgram,
  gnode,
  idOf,
  inputsProgram,
  laneRowsProgram,
  loopProgram,
  note,
  reading,
  start,
  tryProgram,
} from '../../model/graph/graph-scene-fixtures';
import { projectGraphScene } from '../../model/graph/project-graph-scene';
import { drawnHandles } from '../../model/graph/scene-checks';
import type { GraphScene, GraphSceneNode } from '../../model/graph/scene-contract';
import { cardHtml, handlesOf, renderScene } from './render-support';

function sceneOf(program: ProgramV4): GraphScene {
  return projectGraphScene(program, { direction: 'ltr', kinds: STATIC_KIND_LOOKUP });
}

function nodeOf(scene: GraphScene, key: string): GraphSceneNode {
  const found = scene.nodes.find((node) => node.key === key);
  if (found === undefined) throw new Error(`no scene node ${key}`);
  return found;
}

function terminalsProgram(): ProgramV4 {
  return automation([start('s'), gnode('s', 'flow.stop'), reading('sensor')]);
}

const PROGRAMS: Readonly<Record<string, () => ProgramV4>> = {
  try: tryProgram,
  laneRows: laneRowsProgram,
  inputs: inputsProgram,
  admit: admitProgram,
  failure: failureProgram,
  terminals: terminalsProgram,
  decision: decisionProgram,
  loop: loopProgram,
};

describe('every card family', () => {
  it.each(Object.keys(PROGRAMS))('%s: one handle per declared port and no others', (name) => {
    const scene = sceneOf(PROGRAMS[name]?.() ?? tryProgram());
    const html = renderScene(scene);
    expect(scene.nodes.length).toBeGreaterThan(1);
    for (const node of scene.nodes) {
      const drawn = handlesOf(html, node.id);
      expect([...drawn].sort()).toEqual([...drawnHandles(node)].sort());
      expect(new Set(drawn).size).toBe(drawn.length);
    }
  });
});

describe('try card', () => {
  const scene = sceneOf(tryProgram());
  const guarded = nodeOf(scene, 'guarded');
  const html = cardHtml(renderScene(scene), guarded.id);

  it('is 280 wide with Try, the catch row, Finally and Then in that order', () => {
    expect(guarded.w).toBe(280);
    expect(html).toContain('width:280px');
    const order = ['>Try<', '>If it fails<', '>Finally<', '>Then<'].map((text) =>
      html.indexOf(text),
    );
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('draws the lane rows hollow and Then as the next output', () => {
    const lanes = guarded.rows.filter((row) => row.role === 'lane').length;
    expect(lanes).toBe(3);
    expect(html.match(/data-role="lane"/g)?.length).toBe(lanes * 2);
    expect(html).toContain('data-role="next"');
  });

  it('draws the error value as an output of the catch', () => {
    expect(html).toContain('in the catch');
    expect(html).toContain('>Error<');
    expect(handlesOf(renderScene(scene), guarded.id)).toContain('o:error');
  });

  it('names the catch handle from the catch row id', () => {
    expect(handlesOf(renderScene(scene), guarded.id)).toContain(`x:catch:${idOf('guarded:oops')}`);
  });
});

describe('step cards', () => {
  const scene = sceneOf(laneRowsProgram());
  const html = renderScene(scene);

  it('are 248 wide', () => {
    const routed = nodeOf(scene, 'routed');
    expect(routed.w).toBe(248);
    expect(cardHtml(html, routed.id)).toContain('width:248px');
  });

  it('draw the lane row of a routed step with Then on the header', () => {
    const card = cardHtml(html, nodeOf(scene, 'routed').id);
    expect(card).toContain('If it fails');
    expect(card).toContain('class="gc-then"');
  });

  it('draw Timed out on a wait with a timeout', () => {
    expect(cardHtml(html, nodeOf(scene, 'hold').id)).toContain('Timed out');
  });

  it('draw While and then Then as the last row of Set temporarily', () => {
    const card = cardHtml(html, nodeOf(scene, 'temp').id);
    expect(card.indexOf('While')).toBeGreaterThan(0);
    expect(card.indexOf('>Then<')).toBeGreaterThan(card.indexOf('While'));
    expect(card).not.toContain('class="gc-then"');
  });
});

describe('end caps', () => {
  it('draw the return target of a lane end and End at the top level', () => {
    const scene = sceneOf(tryProgram());
    const html = renderScene(scene);
    expect(cardHtml(html, nodeOf(scene, 'risky').id)).toContain('back to Try');
    expect(cardHtml(html, nodeOf(scene, 'after').id)).toContain('>End<');
  });

  it('draw no cap on a wired output', () => {
    const scene = sceneOf(tryProgram());
    const guarded = nodeOf(scene, 'guarded');
    expect(guarded.rows.every((row) => row.endCap === null)).toBe(true);
    expect(cardHtml(renderScene(scene), guarded.id)).not.toContain('gc-end-cap');
  });

  it('shows the return glyph only for a return', () => {
    const scene = sceneOf(tryProgram());
    const html = renderScene(scene);
    expect(cardHtml(html, nodeOf(scene, 'risky').id)).toContain('data-kind="return"');
    expect(cardHtml(html, nodeOf(scene, 'after').id)).toContain('data-kind="end"');
  });
});

describe('start pill and triggers', () => {
  const scene = sceneOf(admitProgram());
  const html = renderScene(scene);
  const pill = nodeOf(scene, 'start');

  it('draws the admit condition as the pin Only start if', () => {
    const card = cardHtml(html, pill.id);
    expect(card).toContain('Only start if');
    expect(handlesOf(html, pill.id)).toContain('v:admit');
  });

  it('shows how many triggers come in on the exec input', () => {
    expect(pill.mergeCount).toBe(2);
    expect(cardHtml(html, pill.id)).toContain('>2</span>');
    expect(handlesOf(html, pill.id)).toContain('x:in');
  });

  it('draws the triggers with an exec output and no exec input', () => {
    const triggers = scene.nodes.filter((node) => node.family === 'trigger');
    expect(triggers).toHaveLength(2);
    for (const trigger of triggers) {
      expect(handlesOf(html, trigger.id)).toContain('x:next');
      expect(handlesOf(html, trigger.id)).not.toContain('x:in');
    }
  });

  it('draws the inputs of a Custom Node as value outputs of Start', () => {
    const custom = sceneOf(inputsProgram());
    const card = cardHtml(renderScene(custom), nodeOf(custom, 'start').id);
    expect(handlesOf(renderScene(custom), nodeOf(custom, 'start').id)).toContain('o:level');
    expect(card).toContain('Level');
  });
});

describe('failure pill, terminals and value cards', () => {
  it('draws the On failure pill with only Then', () => {
    const scene = sceneOf(failureProgram());
    const failure = nodeOf(scene, 'failure');
    const drawn = handlesOf(renderScene(scene), failure.id);
    expect(drawn).toEqual(['x:next']);
    expect(failure.w).toBe(200);
  });

  it('draws a terminal 200 wide with only an exec input', () => {
    const scene = sceneOf(terminalsProgram());
    const stopNode = nodeOf(scene, 's');
    expect(stopNode.w).toBe(200);
    expect(handlesOf(renderScene(scene), stopNode.id)).toEqual(['x:in']);
  });

  it('draws a value card 212 wide with its pins and no exec handle', () => {
    const scene = sceneOf(terminalsProgram());
    const sensor = nodeOf(scene, 'sensor');
    const html = renderScene(scene);
    expect(sensor.w).toBe(212);
    expect(cardHtml(html, sensor.id)).toContain('width:212px');
    expect([...handlesOf(html, sensor.id)].sort()).toEqual([...drawnHandles(sensor)].sort());
    expect(handlesOf(html, sensor.id).some((handle) => handle.startsWith('x:'))).toBe(false);
    expect(cardHtml(html, sensor.id)).toContain('class="gc-vbody"');
  });

  it('draws a value card that feeds a step', () => {
    const scene = sceneOf(automation([start('a'), reading('sensor'), note('a', undefined, {})]));
    expect(nodeOf(scene, 'sensor').family).toBe('value');
  });
});
