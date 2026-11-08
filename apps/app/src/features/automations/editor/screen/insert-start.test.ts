import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION } from '../../model/editor/selection';
import {
  automation,
  gnode,
  idOf,
  ifNode,
  note,
  start,
} from '../../model/graph/graph-scene-fixtures';
import { FREE_POINT } from '../palette/armed-insert';
import { insertStartOf } from './insert-start';

const program = automation([start('a'), note('a', 'b'), note('b')], { triggers: [] });

const picked = (...ids: string[]): { ids: string[]; anchor: string | null } => ({
  ids,
  anchor: ids.at(-1) ?? null,
});

describe('where Add starts', () => {
  it('adds at the end of the one open chain when nothing is selected', () => {
    const point = insertStartOf({ program, selection: EMPTY_SELECTION }, STATIC_KIND_LOOKUP);
    expect(point.pin).toEqual({ kind: 'exec', nodeId: idOf('b'), nodeKey: 'b', port: 'next' });
  });

  it('adds after Start in an automation that has no steps yet', () => {
    const empty = automation([start()], { triggers: [] });
    const point = insertStartOf({ program: empty, selection: EMPTY_SELECTION }, STATIC_KIND_LOOKUP);
    expect(point.pin).toMatchObject({ nodeKey: 'start', port: 'next' });
  });

  it('adds a free step when the chain has several open ends or none', () => {
    const forked = automation(
      [
        start('check'),
        ifNode('check', [{ name: 'dark', to: 'lamp' }], 'dim'),
        note('lamp'),
        note('dim'),
      ],
      { triggers: [] },
    );
    expect(
      insertStartOf({ program: forked, selection: EMPTY_SELECTION }, STATIC_KIND_LOOKUP),
    ).toEqual(FREE_POINT);
    const closed = automation([start('stop'), gnode('stop', 'flow.stop')], { triggers: [] });
    expect(
      insertStartOf({ program: closed, selection: EMPTY_SELECTION }, STATIC_KIND_LOOKUP),
    ).toEqual(FREE_POINT);
  });

  it('adds after the one selected step on its Then exit', () => {
    const point = insertStartOf({ program, selection: picked(idOf('a')) }, STATIC_KIND_LOOKUP);
    expect(point.pin).toEqual({ kind: 'exec', nodeId: idOf('a'), nodeKey: 'a', port: 'next' });
    expect(point.at).toBeNull();
  });

  it('falls back to the end of the chain when several steps or an unknown step are selected', () => {
    const several = insertStartOf(
      { program, selection: picked(idOf('a'), idOf('b')) },
      STATIC_KIND_LOOKUP,
    );
    const unknown = insertStartOf(
      { program, selection: picked(idOf('missing')) },
      STATIC_KIND_LOOKUP,
    );
    expect(several.pin).toMatchObject({ nodeKey: 'b', port: 'next' });
    expect(unknown.pin).toMatchObject({ nodeKey: 'b', port: 'next' });
  });
});
