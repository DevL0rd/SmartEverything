import { describe, expect, it } from 'vitest';
import { levelFrameClass } from './level-frame';
import type { LevelShape } from './level-math';

const SHAPES: readonly LevelShape[] = ['bar', 'slim', 'row', 'rowOpen', 'chip', 'fill'];
const POSITIONS = ['relative', 'absolute', 'fixed', 'sticky', 'static'];

function positionsIn(classes: string): readonly string[] {
  return classes.split(' ').filter((name) => POSITIONS.includes(name));
}

describe('level frame', () => {
  for (const shape of SHAPES) {
    for (const idiom of ['touch', 'pointer'] as const) {
      for (const white of [false, true]) {
        it(`${shape} ${idiom}${white ? ' white' : ''} carries exactly one position utility`, () => {
          const classes = levelFrameClass(
            { shape, white, disabled: false, className: undefined },
            idiom,
          );
          expect(positionsIn(classes)).toHaveLength(1);
        });
      }
    }
  }

  it('fill is absolute and fills its parent', () => {
    const classes = levelFrameClass(
      { shape: 'fill', white: false, disabled: false, className: undefined },
      'touch',
    );
    expect(positionsIn(classes)).toEqual(['absolute']);
    expect(classes).toContain('inset-0');
  });

  it('bars are relative', () => {
    const classes = levelFrameClass(
      { shape: 'bar', white: false, disabled: false, className: undefined },
      'touch',
    );
    expect(positionsIn(classes)).toEqual(['relative']);
  });

  it('a disabled frame has a dashed edge', () => {
    const classes = levelFrameClass(
      { shape: 'bar', white: false, disabled: true, className: undefined },
      'touch',
    );
    expect(classes).toContain('border-dashed');
  });
});
