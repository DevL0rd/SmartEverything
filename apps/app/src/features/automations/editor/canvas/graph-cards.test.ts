import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { GraphNode, ProgramV4 } from '@smarteverything/domain';
import {
  automation,
  decisionProgram,
  forkProgram,
  gnode,
  guardProgram,
  idOf,
  ifNode,
  lastItemProgram,
  loopProgram,
  note,
  start,
  switchProgram,
  wire,
} from '../../model/graph/graph-scene-fixtures';
import { projectGraphScene } from '../../model/graph/project-graph-scene';
import { drawnHandles } from '../../model/graph/scene-checks';
import {
  SCENE_FAMILIES,
  type GraphScene,
  type GraphSceneNode,
} from '../../model/graph/scene-contract';
import { GRAPH_NODE_TYPES } from './node-registry';
import { cardHtml, handlesOf, renderScene } from './render-support';

const FAMILIES: ReadonlySet<string> = new Set(['decision', 'fork', 'join', 'loop']);

function sceneOf(program: ProgramV4): GraphScene {
  return projectGraphScene(program, { direction: 'ltr', kinds: STATIC_KIND_LOOKUP });
}

function nodeOf(scene: GraphScene, key: string): GraphSceneNode {
  const found = scene.nodes.find((node) => node.key === key);
  if (found === undefined) throw new Error(`no scene node ${key}`);
  return found;
}

function structuredIf(): ProgramV4 {
  const mood: GraphNode = {
    ...ifNode('check', [{ name: 'dark', to: 'lamp', when: wire('sensor', 'value') }], 'dim'),
    outputs: [{ name: 'mood', type: { t: 'text' }, values: { dark: { lit: 'a' } } }],
  };
  return automation([start('check'), mood, note('lamp'), note('dim')]);
}

const PROGRAMS: Readonly<Record<string, () => ProgramV4>> = {
  decision: decisionProgram,
  switch: switchProgram,
  guard: guardProgram,
  forkAll: () => forkProgram('all'),
  forkFirst: () => forkProgram('first'),
  loop: loopProgram,
  lastItem: lastItemProgram,
  structured: structuredIf,
};

describe('graph card handles', () => {
  it.each(Object.keys(PROGRAMS))('%s: one handle per declared port and no others', (name) => {
    const scene = sceneOf(PROGRAMS[name]?.() ?? decisionProgram());
    const html = renderScene(scene);
    const cards = scene.nodes.filter((node) => FAMILIES.has(node.family));
    expect(cards.length).toBeGreaterThan(0);
    for (const node of cards) {
      const drawn = handlesOf(html, node.id);
      expect([...drawn].sort()).toEqual([...drawnHandles(node)].sort());
      expect(new Set(drawn).size).toBe(drawn.length);
    }
  });

  it('draws no handle for a port the scene does not declare', () => {
    const scene = sceneOf(decisionProgram());
    const html = renderScene(scene);
    const check = nodeOf(scene, 'check');
    expect(handlesOf(html, check.id)).not.toContain('x:next');
    expect(handlesOf(html, check.id)).toContain('x:else');
  });

  it('registers a card for every scene family', () => {
    expect(Object.keys(GRAPH_NODE_TYPES).sort()).toEqual([...SCENE_FAMILIES].sort());
  });
});

describe('decision card', () => {
  const scene = sceneOf(decisionProgram());
  const check = nodeOf(scene, 'check');
  const html = cardHtml(renderScene(scene), check.id);

  it('shows the condition pin and the exec output of every branch', () => {
    const row = check.rows.find((candidate) => candidate.condition !== null);
    expect(row?.condition?.handle).toBe(`v:row:${idOf('check:dark')}:when`);
    expect(html).toContain(row?.condition?.handle ?? 'missing');
    expect(html).toContain('Otherwise');
    expect(html).toContain('When the condition above is false');
  });

  it('marks branch outputs as branches and gives the last row no condition pin', () => {
    expect(html).toContain('data-role="branch"');
    const otherwise = check.rows.find((row) => row.port === 'else');
    expect(otherwise?.condition).toBeNull();
  });

  it('puts Then of Only continue if on the header and Otherwise on its row', () => {
    const guard = nodeOf(sceneOf(guardProgram()), 'only');
    const card = cardHtml(renderScene(sceneOf(guardProgram())), guard.id);
    expect(card).toContain('class="gc-then"');
    expect(card).toContain('Otherwise');
    expect(card).toContain('data-role="next"');
  });

  it('folds an unused structured output of the If into the more row', () => {
    const structured = sceneOf(structuredIf());
    const check = nodeOf(structured, 'check');
    const card = cardHtml(renderScene(structured), check.id);
    expect(check.outputs.map((pin) => pin.label)).toContain('Mood');
    expect(card).not.toContain('after the If');
    expect(card).toContain('+1 more output');
  });
});

describe('fork and join cards', () => {
  const scene = sceneOf(forkProgram('all'));
  const html = renderScene(scene);
  const fork = nodeOf(scene, 'both');
  const meet = nodeOf(scene, 'meet');

  it('draws one lane row per path and the Add path row', () => {
    const card = cardHtml(html, fork.id);
    expect(fork.rows.map((row) => row.role)).toEqual(['lane', 'lane']);
    expect(card.match(/data-role="lane"/g)?.length).toBe(fork.rows.length * 2);
    expect(card).toContain('+ Add path');
    expect(card).toContain('left');
    expect(card).toContain('right');
  });

  it('shares the pair glyph and colour between the two cards', () => {
    expect(fork.pairIndex).not.toBeNull();
    expect(meet.pairIndex).toBe(fork.pairIndex);
    const glyph = fork.pairIndex === null ? '?' : String.fromCharCode(65 + fork.pairIndex);
    expect(cardHtml(html, fork.id)).toContain(`>${glyph}</span>`);
    expect(cardHtml(html, meet.id)).toContain(`>${glyph}</span>`);
  });

  it('lists every incoming path of the join by its path name, one empty slot, the merge count and what it waits for', () => {
    const card = cardHtml(html, meet.id);
    expect(meet.mergeCount).toBe(2);
    expect(card).toContain('>2</span>');
    expect(card).not.toContain('spare<');
    expect(meet.summary).toMatch(/^Waits for /);
    expect(card).toContain(meet.summary);
    expect(card.match(/class="gc-join-path/g)?.length).toBe(3);
    expect(card).toContain('>Left</span>');
    expect(card).toContain('>Right</span>');
    expect(card).toContain(meet.title);
  });

  it('keeps the join on the same width the metrics give it', () => {
    expect(meet.w).toBe(248);
    expect(fork.w).toBe(280);
  });
});

describe('loop card', () => {
  const scene = sceneOf(loopProgram());
  const each = nodeOf(scene, 'each');
  const html = cardHtml(renderScene(scene), each.id);

  it('draws the lane row, the loop values and When done with results', () => {
    expect(html).toContain('Each item');
    expect(html).toContain('inside the loop');
    expect(html).toContain('>Item<');
    expect(html).toContain('When done');
    expect(html).not.toContain('>Results<');
    expect(html).toContain('+6 more outputs');
    expect(html.indexOf('Each item')).toBeLessThan(html.indexOf('inside the loop'));
    expect(html.indexOf('inside the loop')).toBeLessThan(html.indexOf('When done'));
  });

  it('draws the lane output hollow-styled and Then as a next output', () => {
    expect(html).toContain('data-role="lane"');
    expect(html).toContain('data-role="next"');
  });

  it('is 300 wide', () => {
    expect(each.w).toBe(300);
    expect(html).toContain('width:300px');
  });
});

describe('plain nodes in the scene', () => {
  it('does not render a card for a family this slice leaves to the next one', () => {
    const scene = sceneOf(automation([start('a'), gnode('a', 'notify.feed', {})]));
    expect(scene.nodes.some((node) => FAMILIES.has(node.family))).toBe(false);
  });
});
