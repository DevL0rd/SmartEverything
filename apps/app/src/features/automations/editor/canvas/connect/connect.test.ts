import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { ProgramV4 } from '@smarteverything/domain';
import { canConnect } from '@smarteverything/flow/graph/ops/can-connect';
import { planConnect } from '../../host/connect-intent';
import {
  automation,
  decisionProgram,
  forkProgram,
  gnode,
  loopProgram,
  note,
  start,
  wire,
} from '../../../model/graph/graph-scene-fixtures';
import { projectGraphScene } from '../../../model/graph/project-graph-scene';
import type { EdgeEnd, GraphScene } from '../../../model/graph/scene-contract';
import {
  POINTER_SLOP,
  clientPointOf,
  isTap,
  resolveDrop,
  type Card,
  type ConnectAction,
} from './connect-controller';
import { withFeedback, NO_FEEDBACK } from './connect-toast';
import { cardsOf, intentOf } from './use-graph-connect';
import { buildGraphNodes } from '../scene-to-flow';

function planWithStaticKinds(
  doc: Parameters<typeof planConnect>[0],
  request: Parameters<typeof planConnect>[1],
): ReturnType<typeof planConnect> {
  return planConnect(doc, request, STATIC_KIND_LOOKUP);
}

function sceneOf(program: ProgramV4): GraphScene {
  return projectGraphScene(program, { direction: 'ltr', kinds: STATIC_KIND_LOOKUP });
}

function cardsFrom(scene: GraphScene): readonly Card[] {
  return cardsOf(buildGraphNodes(scene));
}

function card(scene: GraphScene, key: string): Card {
  const found = cardsFrom(scene).find((candidate) => candidate.scene.key === key);
  if (found === undefined) throw new Error(`no card ${key}`);
  return found;
}

function exitOf(scene: GraphScene, key: string, port: string): EdgeEnd {
  const owner = card(scene, key);
  const row = owner.scene.rows.find((candidate) => candidate.port === port);
  if (row === undefined) throw new Error(`no exit ${port} on ${key}`);
  return { nodeId: owner.id, handle: row.handle };
}

function centreOf(target: Card): { x: number; y: number } {
  return { x: target.x + target.w / 2, y: target.y + target.h / 2 };
}

const SCREEN = { x: 40, y: 50 };

function dropOn(scene: GraphScene, source: EdgeEnd, onKey: string, zoom = 1): ConnectAction {
  return resolveDrop({
    source,
    point: centreOf(card(scene, onKey)),
    screen: SCREEN,
    zoom,
    cards: cardsFrom(scene),
    landed: null,
  });
}

const LAYOUT = { nodes: {}, frames: [], comments: [] };

function refusalOf(
  program: ProgramV4,
  scene: GraphScene,
  from: [string, string],
  to: string,
): string {
  const action = dropOn(scene, exitOf(scene, from[0], from[1]), to);
  const intent = intentOf(action);
  if (intent?.type !== 'connect') throw new Error('expected a connect intent');
  const planned = planWithStaticKinds({ program, layout: LAYOUT }, intent.request);
  if (planned.ok) throw new Error('expected a refusal');
  return planned.reason;
}

describe('pointer drag from an output pin', () => {
  it('drops anywhere on a card onto its exec input', () => {
    const scene = sceneOf(decisionProgram());
    const action = dropOn(scene, exitOf(scene, 'lamp', 'next'), 'dim');
    expect(action).toEqual({
      kind: 'connect',
      from: exitOf(scene, 'lamp', 'next'),
      to: { nodeId: card(scene, 'dim').id, handle: 'x:in' },
    });
  });

  it('opens the palette when the wire is dropped on empty canvas', () => {
    const scene = sceneOf(decisionProgram());
    const from = exitOf(scene, 'lamp', 'next');
    const point = { x: -900, y: -900 };
    const action = resolveDrop({
      source: from,
      point,
      screen: SCREEN,
      zoom: 1,
      cards: cardsFrom(scene),
      landed: null,
    });
    expect(action).toEqual({ kind: 'dropEmpty', from, point, screen: SCREEN });
    expect(intentOf(action)).toEqual({ type: 'dropEmpty', from, point, screen: SCREEN });
  });

  it('uses the exec input the pointer snapped to even outside the card', () => {
    const scene = sceneOf(decisionProgram());
    const landed = { nodeId: card(scene, 'dim').id, handle: 'x:in' };
    const action = resolveDrop({
      source: exitOf(scene, 'lamp', 'next'),
      point: { x: -900, y: -900 },
      screen: SCREEN,
      zoom: 1,
      cards: cardsFrom(scene),
      landed,
    });
    expect(action.kind === 'connect' && action.to).toEqual(landed);
  });

  it('ignores a value pin that the pointer snapped to when an exec wire was dragged', () => {
    const scene = sceneOf(decisionProgram());
    const action = resolveDrop({
      source: exitOf(scene, 'lamp', 'next'),
      point: { x: -900, y: -900 },
      screen: SCREEN,
      zoom: 1,
      cards: cardsFrom(scene),
      landed: { nodeId: card(scene, 'check').id, handle: 'v:row:any:when' },
    });
    expect(action.kind).toBe('dropEmpty');
  });

  it('does nothing for a handle that is not an output', () => {
    const scene = sceneOf(decisionProgram());
    const source = { nodeId: card(scene, 'dim').id, handle: 'x:in' };
    expect(dropOn(scene, source, 'lamp')).toEqual({ kind: 'none' });
  });

  it('opens the palette when a wire dragged out of an input is dropped on empty canvas', () => {
    const scene = sceneOf(decisionProgram());
    const from = { nodeId: card(scene, 'dim').id, handle: 'x:in' };
    const point = { x: -900, y: -900 };
    const action = resolveDrop({
      source: from,
      point,
      screen: SCREEN,
      zoom: 1,
      cards: cardsFrom(scene),
      landed: null,
    });
    expect(action).toEqual({ kind: 'dropEmpty', from, point, screen: SCREEN });
  });

  it('tells a tap from a drag by the distance moved', () => {
    expect(isTap({ x: 0, y: 0 }, { x: 1, y: 1 }, POINTER_SLOP)).toBe(true);
    expect(isTap({ x: 0, y: 0 }, { x: 5, y: 0 }, POINTER_SLOP)).toBe(false);
  });

  it('reads the pointer from a mouse event and from the last touch', () => {
    expect(clientPointOf({ clientX: 4, clientY: 9 })).toEqual({ x: 4, y: 9 });
    expect(clientPointOf({ changedTouches: [{ clientX: 7, clientY: 8 }] })).toEqual({ x: 7, y: 8 });
    expect(clientPointOf({})).toBeNull();
  });
});

describe('value connects', () => {
  function valueScene(): GraphScene {
    return sceneOf(
      automation([
        start('show'),
        gnode('sensor', 'device.get', { ports: { device: { lit: 'hall' } } }),
        note('show'),
        note('other', undefined, { ports: { message: wire('sensor', 'value') } }),
      ]),
    );
  }

  it('connects to the input pin the pointer snapped to', () => {
    const scene = valueScene();
    const sensor = card(scene, 'sensor');
    const out = sensor.scene.outputs[0]?.handle ?? '';
    const landed = { nodeId: card(scene, 'show').id, handle: 'v:message' };
    const action = resolveDrop({
      source: { nodeId: sensor.id, handle: out },
      point: { x: -900, y: -900 },
      screen: SCREEN,
      zoom: 1,
      cards: cardsFrom(scene),
      landed,
    });
    expect(action.kind === 'connect' && action.to).toEqual(landed);
  });

  it('targets the card below zoom 0.9 by picking its free input of the same type', () => {
    const scene = valueScene();
    const sensor = card(scene, 'sensor');
    const out = sensor.scene.outputs[0]?.handle ?? '';
    const action = dropOn(scene, { nodeId: sensor.id, handle: out }, 'show', 0.5);
    const free = card(scene, 'show').scene.inputs.find((pin) => !pin.wired);
    expect(action.kind === 'connect' && action.to.handle).toBe(free?.handle);
  });

  it('leaves the card body to the host from zoom 0.9 up', () => {
    const scene = valueScene();
    const sensor = card(scene, 'sensor');
    const out = sensor.scene.outputs[0]?.handle ?? '';
    const action = dropOn(scene, { nodeId: sensor.id, handle: out }, 'show', 1);
    expect(action.kind === 'connect' && action.to.handle).toBe('x:in');
  });

  it('refuses a value dropped on a step card with the host reason', () => {
    const program = automation([
      start('show'),
      gnode('sensor', 'device.get', { ports: { device: { lit: 'hall' } } }),
      note('show'),
    ]);
    const scene = sceneOf(program);
    const sensor = card(scene, 'sensor');
    const intent = intentOf(
      dropOn(scene, { nodeId: sensor.id, handle: sensor.scene.outputs[0]?.handle ?? '' }, 'show'),
    );
    if (intent?.type !== 'connect') throw new Error('expected a connect intent');
    const planned = planWithStaticKinds({ program, layout: LAYOUT }, intent.request);
    expect(planned.ok).toBe(false);
  });
});

describe('connect refusals reach the toast with the checker reason', () => {
  const cases: readonly {
    readonly name: string;
    readonly program: () => ProgramV4;
    readonly from: [string, string];
    readonly to: string;
    readonly reason: string;
  }[] = [
    {
      name: 'circle',
      program: decisionProgram,
      from: ['after', 'next'],
      to: 'check',
      reason: 'circle',
    },
    {
      name: 'into start',
      program: decisionProgram,
      from: ['lamp', 'next'],
      to: 'start',
      reason: 'into_start',
    },
    {
      name: 'across a region',
      program: loopProgram,
      from: ['show', 'next'],
      to: 'done',
      reason: 'across_region',
    },
    {
      name: 'between paths',
      program: () => forkProgram('all'),
      from: ['l', 'next'],
      to: 'r',
      reason: 'between_paths',
    },
  ];

  it.each(cases)('$name', ({ program: build, from, to, reason }) => {
    const program = build();
    const scene = sceneOf(program);
    const source = card(scene, from[0]);
    const target = card(scene, to);
    const verdict = canConnect(
      program,
      {
        from: source.scene.key,
        port: from[1],
        to: target.scene.key,
      },
      STATIC_KIND_LOOKUP,
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe(reason);
    const text = refusalOf(program, scene, from, to);
    expect(text).toBe(verdict.message);
    const shown = withFeedback(NO_FEEDBACK, { announcement: text, toast: text, failed: true });
    expect(shown.toast?.text).toBe(text);
    expect(shown.assertive?.text).toBe(text);
    expect(shown.polite).toBeNull();
  });

  it('names the circle in words the user can act on', () => {
    const program = decisionProgram();
    const scene = sceneOf(program);
    expect(refusalOf(program, scene, ['after', 'next'], 'check')).toBe(
      'This would make a circle. Use a loop to repeat.',
    );
  });
});

describe('replacing a wire', () => {
  it('toasts which exit now goes where', () => {
    const program = decisionProgram();
    const scene = sceneOf(program);
    const action = dropOn(scene, exitOf(scene, 'lamp', 'next'), 'dim');
    const intent = intentOf(action);
    if (intent?.type !== 'connect') throw new Error('expected a connect intent');
    const planned = planWithStaticKinds({ program, layout: LAYOUT }, intent.request);
    if (!planned.ok) throw new Error(planned.reason);
    const message = planned.message({ program, created: [] });
    expect(message.toast).toMatch(/^Replaced: .+ now goes to .+\.$/);
    const shown = withFeedback(NO_FEEDBACK, {
      ...message,
      toast: message.toast ?? null,
      failed: false,
    });
    expect(shown.toast?.text).toBe(message.toast);
    expect(shown.polite?.text).toBe(message.announcement);
  });
});
