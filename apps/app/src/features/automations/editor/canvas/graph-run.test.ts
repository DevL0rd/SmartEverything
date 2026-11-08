import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { forkProgram, loopProgram } from '../../model/graph/graph-scene-fixtures';
import { projectGraphScene } from '../../model/graph/project-graph-scene';
import type { GraphRunOverlay } from '../../model/graph/run-overlay';
import type { GraphScene } from '../../model/graph/scene-contract';
import { GraphRunStore } from './graph-context';
import { cardHtml, renderScene } from './render-support';

function overlay(partial: Partial<GraphRunOverlay>): GraphRunOverlay {
  return { version: 1, live: true, nodes: {}, taken: [], stepper: {}, ...partial };
}

function sceneOf(program: Parameters<typeof projectGraphScene>[0]): GraphScene {
  return projectGraphScene(program, { direction: 'ltr', kinds: STATIC_KIND_LOOKUP });
}

describe('run state on the cards', () => {
  const scene = sceneOf(loopProgram());
  const each = scene.nodes.find((node) => node.key === 'each');
  const id = each?.id ?? '';

  it('shows the pass stepper with two 44 px-class buttons on the loop', () => {
    const html = renderScene(
      scene,
      overlay({ stepper: { [id]: { position: 3, total: 4, iteration: 3 } } }),
    );
    const card = cardHtml(html, id);
    expect(card).toContain('Pass 3 of 4');
    expect(card).toContain('aria-label="Previous pass"');
    expect(card).toContain('aria-label="Next pass"');
  });

  it('shows no stepper outside the run view', () => {
    expect(cardHtml(renderScene(scene), id)).not.toContain('Pass ');
  });

  it('sets the running state and the failed text on the card', () => {
    const running = renderScene(scene, overlay({ nodes: { [id]: { state: 'running' } } }));
    expect(cardHtml(running, id)).toContain('data-state="running"');
    const failed = renderScene(
      scene,
      overlay({ nodes: { [id]: { state: 'failed', text: 'Lamp offline' } } }),
    );
    expect(cardHtml(failed, id)).toContain('data-state="failed"');
    expect(cardHtml(failed, id)).toContain('Lamp offline');
  });
});

describe('GraphRunStore', () => {
  const scene = sceneOf(forkProgram('all'));
  const [first, second] = scene.nodes;
  const one = first?.id ?? '';
  const two = second?.id ?? '';

  it('tells only the cards whose run state changed', () => {
    const store = new GraphRunStore();
    const heard: string[] = [];
    store.subscribe(one, () => heard.push(one));
    store.subscribe(two, () => heard.push(two));
    store.update(overlay({ nodes: { [one]: { state: 'running' }, [two]: { state: 'done' } } }));
    heard.length = 0;
    store.update(overlay({ nodes: { [one]: { state: 'running' }, [two]: { state: 'failed' } } }));
    expect(heard).toEqual([two]);
  });

  it('keeps the same snapshot for an unchanged card across overlay replacements', () => {
    const store = new GraphRunStore();
    store.update(overlay({ nodes: { [one]: { state: 'running' } } }));
    const before = store.read(one);
    store.update(overlay({ nodes: { [one]: { state: 'running' } }, taken: ['x'] }));
    expect(store.read(one)).toBe(before);
  });

  it('forgets a card that leaves the overlay', () => {
    const store = new GraphRunStore();
    store.update(overlay({ nodes: { [one]: { state: 'running' } } }));
    store.update(null);
    expect(store.read(one).node).toBeNull();
  });
});
