import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { decisionProgram, forkProgram } from '../../../model/graph/graph-scene-fixtures';
import { projectGraphScene } from '../../../model/graph/project-graph-scene';
import type { GraphScene } from '../../../model/graph/scene-contract';
import {
  NUDGE_STEP,
  commandFor,
  type KeyCommand,
  type KeyContext,
  type KeyLike,
} from './graph-keys';
import { needsReveal } from './graph-nav';

const scene: GraphScene = projectGraphScene(decisionProgram(), {
  direction: 'ltr',
  kinds: STATIC_KIND_LOOKUP,
});

function idOf(key: string): string {
  const found = scene.nodes.find((node) => node.key === key);
  if (found === undefined) throw new Error(`no node ${key}`);
  return found.id;
}

function press(key: string, modifiers: Partial<KeyLike> = {}): KeyLike {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers,
  };
}

function context(focused: string | null, extra: Partial<KeyContext> = {}): KeyContext {
  return { scene, focused, selection: [], wires: [], armed: false, ...extra };
}

function focusOf(command: KeyCommand | null): string | null {
  return command?.type === 'focus' ? command.id : null;
}

describe('Tab follows the structured order', () => {
  it('goes to the next and the previous card in scene order', () => {
    const [first, second, third] = scene.nodes;
    const forward = commandFor(press('Tab'), context(first?.id ?? null));
    const back = commandFor(press('Tab', { shiftKey: true }), context(third?.id ?? null));
    expect(focusOf(forward)).toBe(second?.id);
    expect(focusOf(back)).toBe(second?.id);
  });

  it('lets Tab leave the canvas at either end', () => {
    const last = scene.nodes[scene.nodes.length - 1];
    expect(commandFor(press('Tab'), context(last?.id ?? null))).toBeNull();
    expect(
      commandFor(press('Tab', { shiftKey: true }), context(scene.nodes[0]?.id ?? null)),
    ).toBeNull();
    expect(commandFor(press('Tab'), context(null))).toBeNull();
  });
});

describe('arrow keys follow the wires', () => {
  it('Right follows Then, or the first branch of a decision', () => {
    expect(focusOf(commandFor(press('ArrowRight'), context(idOf('check'))))).toBe(idOf('lamp'));
    expect(focusOf(commandFor(press('ArrowRight'), context(idOf('lamp'))))).toBe(idOf('after'));
  });

  it('Left goes to the step that leads here', () => {
    expect(focusOf(commandFor(press('ArrowLeft'), context(idOf('lamp'))))).toBe(idOf('check'));
  });

  it('Up and Down move between the branches of one decision', () => {
    expect(focusOf(commandFor(press('ArrowDown'), context(idOf('lamp'))))).toBe(idOf('dim'));
    expect(focusOf(commandFor(press('ArrowUp'), context(idOf('dim'))))).toBe(idOf('lamp'));
    expect(commandFor(press('ArrowUp'), context(idOf('lamp')))).toBeNull();
  });

  it('moves between the paths of a Do together', () => {
    const forked = projectGraphScene(forkProgram('all'), {
      direction: 'ltr',
      kinds: STATIC_KIND_LOOKUP,
    });
    const left = forked.nodes.find((node) => node.key === 'l')?.id ?? '';
    const right = forked.nodes.find((node) => node.key === 'r')?.id ?? '';
    const command = commandFor(press('ArrowDown'), {
      scene: forked,
      focused: left,
      selection: [],
      wires: [],
      armed: false,
    });
    expect(focusOf(command)).toBe(right);
  });

  it('pans the view without a focused card', () => {
    expect(commandFor(press('ArrowRight'), context(null))).toEqual({ type: 'pan', key: 'right' });
  });
});

describe('Alt and an arrow key moves by 8 px as one move intent', () => {
  it('nudges the focused card when it is not part of the selection', () => {
    const command = commandFor(press('ArrowRight', { altKey: true }), context(idOf('lamp')));
    expect(command).toEqual({
      type: 'emit',
      intents: [
        {
          type: 'move',
          request: { kind: 'nudge', ids: [idOf('lamp')], dx: NUDGE_STEP, dy: 0 },
        },
      ],
    });
    expect(NUDGE_STEP).toBe(8);
  });

  it('nudges the whole selection upward in a single intent', () => {
    const selection = [idOf('lamp'), idOf('dim')];
    const command = commandFor(
      press('ArrowUp', { altKey: true }),
      context(idOf('lamp'), { selection }),
    );
    expect(command?.type === 'emit' && command.intents).toEqual([
      { type: 'move', request: { kind: 'nudge', ids: selection, dx: 0, dy: -NUDGE_STEP } },
    ]);
  });

  it('moves a selection even when no card has focus', () => {
    const command = commandFor(
      press('ArrowLeft', { altKey: true }),
      context(null, { selection: [idOf('dim')] }),
    );
    expect(command?.type === 'emit' && command.intents).toHaveLength(1);
  });

  it('does nothing when there is nothing to move', () => {
    expect(commandFor(press('ArrowDown', { altKey: true }), context(null))).toBeNull();
  });
});

describe('open, select, escape and delete', () => {
  it('Enter opens the inspector for the focused card', () => {
    expect(commandFor(press('Enter'), context(idOf('lamp')))).toEqual({
      type: 'emit',
      intents: [{ type: 'open', nodeId: idOf('lamp') }],
    });
  });

  it('Space selects the focused card', () => {
    expect(commandFor(press(' '), context(idOf('lamp')))).toEqual({
      type: 'emit',
      intents: [{ type: 'select', ids: [idOf('lamp')] }],
    });
  });

  it('Escape hands focus back to the top bar', () => {
    expect(commandFor(press('Escape'), context(idOf('lamp')))).toEqual({
      type: 'emit',
      intents: [{ type: 'escape' }],
    });
  });

  it('Escape only cancels a pending connect while one is armed', () => {
    expect(commandFor(press('Escape'), context(null, { armed: true }))).toEqual({ type: 'disarm' });
  });

  it('Delete disconnects the selected wires, one intent each', () => {
    const wire = scene.edges.find((edge) => edge.kind === 'exec' && !edge.fixed);
    const command = commandFor(press('Delete'), context(null, { wires: [wire?.id ?? ''] }));
    expect(command?.type === 'emit' && command.intents).toEqual([
      { type: 'disconnect', request: { kind: 'exec', from: wire?.source } },
    ]);
  });

  it('Delete removes selected cards when no wire is selected', () => {
    const selection = [idOf('dim')];
    expect(commandFor(press('Backspace'), context(null, { selection }))).toEqual({
      type: 'emit',
      intents: [{ type: 'delete', request: { ids: selection } }],
    });
    expect(commandFor(press('Delete'), context(null))).toBeNull();
  });

  it('turns command keys into shortcut intents and leaves other command combos alone', () => {
    expect(commandFor(press('c', { ctrlKey: true }), context(idOf('lamp')))).toEqual({
      type: 'emit',
      intents: [{ type: 'shortcut', name: 'copy' }],
    });
    expect(commandFor(press('Z', { ctrlKey: true, shiftKey: true }), context(null))).toEqual({
      type: 'emit',
      intents: [{ type: 'shortcut', name: 'redo' }],
    });
    expect(commandFor(press('ArrowRight', { metaKey: true }), context(idOf('lamp')))).toBeNull();
  });

  it('zooms and fits with plain keys and pans with the arrows when nothing is focused', () => {
    expect(commandFor(press('f'), context(null))).toEqual({ type: 'view', key: 'fit' });
    expect(commandFor(press('F', { shiftKey: true }), context(null))).toEqual({
      type: 'view',
      key: 'fitSelection',
    });
    expect(commandFor(press('-'), context(null))).toEqual({ type: 'view', key: 'zoomOut' });
    expect(commandFor(press('ArrowLeft'), context(null))).toEqual({ type: 'pan', key: 'left' });
  });
});

describe('revealing a card after keyboard navigation', () => {
  const view = { x: 0, y: 0, zoom: 1 };
  const size = { width: 400, height: 300 };

  it('stays put while the card is fully visible', () => {
    expect(needsReveal({ x: 10, y: 10, w: 100, h: 80 }, view, size)).toBe(false);
  });

  it('pans when any edge is outside the view', () => {
    expect(needsReveal({ x: 350, y: 10, w: 100, h: 80 }, view, size)).toBe(true);
    expect(needsReveal({ x: -10, y: 10, w: 100, h: 80 }, view, size)).toBe(true);
    expect(needsReveal({ x: 10, y: 10, w: 100, h: 80 }, { x: 0, y: 0, zoom: 4 }, size)).toBe(true);
  });
});
