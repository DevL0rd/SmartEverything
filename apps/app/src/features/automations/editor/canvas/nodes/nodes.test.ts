import { describe, expect, it } from 'vitest';
import type { FlowNode } from '@smarteverything/domain';
import { NODE_REGISTRY, EMPTY_LAYOUT } from '@smarteverything/domain';
import type { SceneNode, ScenePort } from '../../../model/canvas/contract';
import { SCENE_ROLES } from '../../../model/canvas/contract';
import { PORT_ROW_H, STEP_BASE_H } from '../../../model/canvas/metrics';
import { Ids, automation, scope, setLight } from '../../../model/canvas/canvas-fixtures';
import { projectScene } from '../../../model/canvas/project-scene';
import {
  MENU_ACTIONS,
  clampMenu,
  menuHeight,
  nodeMenuItems,
  stepIndex,
  wrapChoices,
} from '../context-menu';
import { headerPills, limitBadges } from './chips';
import { isInstance } from './instance-card';
import { SCENE_NODE_TYPES } from './node-types';
import { isOptionalType, pinTop, typeToken, STEP_ROWS, WHOLE_CARD, zoneLayout } from './ports';
import { runLabel } from './run-badges';

function port(partial: Partial<ScenePort>): ScenePort {
  return {
    name: 'p',
    label: 'P',
    shape: 'circle',
    type: 'Number',
    direction: 'in',
    value: null,
    wired: false,
    problem: false,
    ...partial,
  };
}

function node(partial: Partial<SceneNode>): SceneNode {
  return {
    id: 'n',
    role: 'step',
    kind: null,
    title: 'Title',
    subtitle: '',
    overline: null,
    icon: 'zap',
    category: 'flow',
    ariaLabel: 'Label',
    ordinal: 1,
    parentId: null,
    depth: 0,
    x: 0,
    y: 0,
    w: 248,
    h: 68,
    enabled: true,
    collapsed: false,
    opensBody: false,
    unused: false,
    feeds: null,
    revision: null,
    updateAvailable: false,
    hiddenCount: 0,
    chip: null,
    pills: [],
    ports: [],
    outputs: [],
    problems: [],
    run: null,
    ...partial,
  };
}

describe('node types', () => {
  it('has a card for every scene role', () => {
    for (const role of SCENE_ROLES) expect(SCENE_NODE_TYPES[role]).toBeDefined();
  });
});

describe('port types', () => {
  it('maps shapes and phrases to type tokens', () => {
    expect(typeToken('List of text', 'diamond')).toBe('list');
    expect(typeToken('Record', 'square')).toBe('record');
    expect(typeToken('Light', 'hexagon')).toBe('reference');
    expect(typeToken('Error', 'triangle')).toBe('error');
    expect(typeToken('On/off', 'circle')).toBe('boolean');
    expect(typeToken('Optional text', 'circle')).toBe('text');
    expect(typeToken('Date and time', 'circle')).toBe('time');
    expect(typeToken('Time of day', 'circle')).toBe('time');
    expect(typeToken('Choice of a, b', 'circle')).toBe('choice');
    expect(typeToken('Any value', 'circle')).toBe('any');
    expect(typeToken('Color', 'circle')).toBe('color');
    expect(typeToken('Whole number from 1', 'circle')).toBe('number');
    expect(isOptionalType('Optional text')).toBe(true);
    expect(isOptionalType('Text')).toBe(false);
  });

  it('places step inputs on their rows and spreads the rest', () => {
    expect(pinTop(STEP_ROWS, 0, 2)).toEqual({ top: STEP_BASE_H + PORT_ROW_H / 2 });
    expect(pinTop(STEP_ROWS, 1, 2)).toEqual({ top: STEP_BASE_H + PORT_ROW_H * 1.5 });
    expect(pinTop(WHOLE_CARD, 0, 1)).toEqual({ top: '50%' });
    expect(pinTop(zoneLayout(40), 0, 1)).toEqual({ top: 20 });
  });
});

describe('badges', () => {
  it('names the header pills of blocks', () => {
    expect(
      headerPills(node({ kind: 'flow.switch', ports: [port({ name: 'mode', value: 'all' })] })),
    ).toEqual(['Every matching case']);
    expect(headerPills(node({ kind: 'flow.switch' }))).toEqual([]);
    expect(headerPills(node({ kind: 'flow.parallel' }))).toEqual(['Wait for all']);
    expect(
      headerPills(node({ kind: 'flow.parallel', ports: [port({ name: 'join', value: 'first' })] })),
    ).toEqual(['First to finish wins']);
    expect(
      headerPills(
        node({ kind: 'flow.for_each', ports: [port({ name: 'concurrency', value: '3' })] }),
      ),
    ).toEqual(['At the same time']);
    expect(headerPills(node({ kind: 'flow.for_each' }))).toEqual([]);
    expect(headerPills(node({ kind: 'device.set' }))).toEqual([]);
  });

  it('lists the gap and the limit of loops', () => {
    const loop = node({
      ports: [
        port({ name: 'times', value: '3' }),
        port({ name: 'gap', label: 'Gap', value: '1 s' }),
        port({ name: 'limit', label: 'Limit', value: '1 h' }),
      ],
    });
    expect(limitBadges(loop)).toEqual([
      { name: 'gap', text: 'Gap 1 s' },
      { name: 'limit', text: 'Limit 1 h' },
    ]);
    expect(limitBadges(node({}))).toEqual([]);
  });

  it('labels run states', () => {
    expect(runLabel({ state: 'skipped' })).toBe('Skipped');
    expect(runLabel({ state: 'done', text: '62 %' })).toBe('62 %');
    expect(runLabel({ state: 'running', iteration: 3 })).toBe('Time 3');
    expect(runLabel({ state: 'running' })).toBeNull();
  });

  it('reads blocks from a real scene', () => {
    const ids = new Ids(1);
    const parallel: FlowNode = {
      ...ids.next(),
      kind: 'flow.parallel',
      ports: { join: { lit: 'first' } },
      scopes: { b0: scope([setLight(ids, null)]), b1: scope([setLight(ids, null)]) },
    };
    const scene = projectScene(automation([parallel]), {
      registry: NODE_REGISTRY,
      layout: EMPTY_LAYOUT,
      mode: 'wide',
    });
    const block = scene.nodes.find((entry) => entry.kind === 'flow.parallel');
    expect(block).toBeDefined();
    expect(headerPills(block ?? node({}))).toEqual(['First to finish wins']);
  });
});

describe('instances', () => {
  it('knows reusable instances by their overline', () => {
    expect(isInstance(node({ overline: 'Custom Node' }))).toBe(true);
    expect(isInstance(node({ overline: 'Trigger' }))).toBe(false);
  });
});

describe('context menu', () => {
  const labels = (scene: SceneNode, count = 1): string[] =>
    nodeMenuItems(scene, count).map((entry) => entry.label);

  it('offers the full set on a step', () => {
    const actions = nodeMenuItems(node({}), 1).map((entry) => entry.action);
    expect(actions).toEqual([
      'edit',
      'renameKey',
      'duplicate',
      'copy',
      'delete',
      'disable',
      'wrapIn',
      'makeReusable',
      'pauseHere',
      'copyReference',
      'freePosition',
      'addComment',
    ]);
  });

  it('adds Unwrap to blocks and Open node and Detach to instances', () => {
    expect(labels(node({ role: 'container' }))).toContain('Unwrap');
    const instance = labels(node({ overline: 'Custom Node' }));
    expect(instance).toContain('Open node');
    expect(instance).toContain('Detach');
    expect(labels(node({}))).not.toContain('Unwrap');
  });

  it('says Enable for a disabled step and drops reference and wrapping from triggers', () => {
    expect(labels(node({ enabled: false }))).toContain('Enable');
    const trigger = labels(node({ role: 'trigger' }));
    expect(trigger).not.toContain('Copy reference');
    expect(trigger).not.toContain('Pause here');
    expect(trigger).not.toContain('Wrap in…');
  });

  it('has no menu for lanes, slots and bars', () => {
    for (const role of [
      'lane',
      'failure',
      'slot',
      'inputs',
      'exits',
      'admit',
      'triggerGroup',
    ] as const) {
      expect(nodeMenuItems(node({ role }), 1)).toEqual([]);
    }
  });

  it('marks Delete as destructive and covers every action', () => {
    const every = new Set(
      [node({}), node({ role: 'container' }), node({ overline: 'Custom Node' })].flatMap((scene) =>
        nodeMenuItems(scene, 1).map((entry) => entry.action),
      ),
    );
    expect(MENU_ACTIONS.filter((action) => !every.has(action))).toEqual([]);
    expect(nodeMenuItems(node({}), 1).find((entry) => entry.action === 'delete')?.destructive).toBe(
      true,
    );
  });

  it('lists the wrapping blocks', () => {
    expect(wrapChoices().map((entry) => entry.label)).toEqual([
      'If',
      'For each',
      'Try',
      'Do together',
      'Repeat',
      'While',
    ]);
  });

  it('keeps the menu inside the canvas', () => {
    const size = { w: 224, h: menuHeight(10, 'pointer') };
    expect(clampMenu({ x: 5, y: 5 }, size, { w: 800, h: 600 })).toEqual({ x: 8, y: 8 });
    expect(clampMenu({ x: 790, y: 590 }, size, { w: 800, h: 600 })).toEqual({
      x: 800 - 224 - 8,
      y: 600 - size.h - 8,
    });
  });

  it('moves the active row with the arrow keys', () => {
    expect(stepIndex(0, 3, 'ArrowDown')).toBe(1);
    expect(stepIndex(2, 3, 'ArrowDown')).toBe(0);
    expect(stepIndex(0, 3, 'ArrowUp')).toBe(2);
    expect(stepIndex(1, 3, 'Home')).toBe(0);
    expect(stepIndex(1, 3, 'End')).toBe(2);
    expect(stepIndex(1, 3, 'a')).toBe(1);
    expect(stepIndex(0, 0, 'ArrowDown')).toBe(0);
  });
});
