import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { GraphScene } from './scene-contract';
import {
  admitProgram,
  automation,
  decisionProgram,
  gnode,
  note,
  reading,
  start,
  wire as valueWire,
  forkProgram,
  idOf,
  loopProgram,
  switchProgram,
} from './graph-scene-fixtures';
import { projectGraphScene } from './project-graph-scene';
import { record, runRecord } from './run-records-fixtures';
import { joinProgress, progressText, takenWires } from './taken-wires';
import type { Activation } from '../../runs/run-view/run-activation';
import type { ProgramV4 } from '@smarteverything/domain';

function sceneOf(program: ProgramV4): GraphScene {
  return projectGraphScene(program, { direction: 'ltr', kinds: STATIC_KIND_LOOKUP });
}

function wire(from: string, handle: string, to: string): string {
  return `exec:${idOf(from)}.${handle}>${idOf(to)}`;
}

function taken(
  scene: GraphScene,
  records: readonly Activation[],
  iterations = new Map<string, number>(),
): readonly string[] {
  return takenWires({ scene, records, iterations });
}

describe('takenWires on a decision', () => {
  const scene = sceneOf(decisionProgram());
  const dark = `row:${idOf('check:dark')}`;

  it('lights the chosen row and the wires that followed it, not the other row', () => {
    const wires = taken(scene, [
      record('start', { seq: 1 }),
      record('lamp', { seq: 3 }),
      record('check', { seq: 4 }),
      record('after', { seq: 5 }),
    ]);
    expect(wires).toContain(wire('start', 'x:next', 'check'));
    expect(wires).toContain(wire('check', `x:${dark}`, 'lamp'));
    expect(wires).toContain(wire('lamp', 'x:next', 'after'));
    expect(wires).not.toContain(wire('check', 'x:else', 'dim'));
    expect(wires).not.toContain(wire('dim', 'x:next', 'after'));
  });

  it('lights the Otherwise row when it was chosen', () => {
    const wires = taken(scene, [
      record('start', { seq: 1 }),
      record('dim', { seq: 3 }),
      record('check', { seq: 4 }),
      record('after', { seq: 5 }),
    ]);
    expect(wires).toContain(wire('check', 'x:else', 'dim'));
    expect(wires).not.toContain(wire('check', `x:${dark}`, 'lamp'));
    expect(wires).toContain(wire('dim', 'x:next', 'after'));
  });

  it('lights the row whose step is running while the decision has not closed yet', () => {
    const wires = taken(scene, [
      record('start', { seq: 1 }),
      record('lamp', { seq: 3, status: 'running' }),
    ]);
    expect(wires).toContain(wire('check', `x:${dark}`, 'lamp'));
    expect(wires).not.toContain(wire('check', 'x:else', 'dim'));
  });

  it('lights the wire only when the target ran as well', () => {
    const wires = taken(scene, [record('start', { seq: 1 }), record('check', { seq: 4 })]);
    expect(wires).not.toContain(wire('check', `x:${dark}`, 'lamp'));
  });

  it('lights the wire into a step only after the source finished before it', () => {
    const wires = taken(scene, [record('start', { seq: 5 }), record('check', { seq: 4 })]);
    expect(wires.filter((id) => !id.startsWith(`exec:${idOf('tick')}.`))).toEqual([]);
  });

  it('lights the chosen case of a Switch', () => {
    const switched = sceneOf(switchProgram());
    const wires = taken(switched, [
      record('start', { seq: 1 }),
      record('b', { seq: 2 }),
      record('mode', { seq: 3 }),
    ]);
    expect(wires).toContain(wire('mode', `x:case:${idOf('mode:dim')}`, 'b'));
    expect(wires).not.toContain(wire('mode', `x:case:${idOf('mode:bright')}`, 'a'));
    expect(wires).not.toContain(wire('mode', 'x:default', 'c'));
  });

  it('lights the default of a Switch', () => {
    const wires = taken(sceneOf(switchProgram()), [
      record('c', { seq: 2 }),
      record('mode', { seq: 3 }),
    ]);
    expect(wires).toContain(wire('mode', 'x:default', 'c'));
  });
});

describe('takenWires on merges and Do together', () => {
  const scene = sceneOf(forkProgram('all'));

  it('lights each path on its own and the wires into the merge that already finished', () => {
    const wires = taken(scene, [
      record('both', { seq: 2 }),
      record('l', { seq: 3 }),
      record('r', { seq: 4, status: 'running' }),
    ]);
    expect(wires).toContain(wire('both', 'x:path:left', 'l'));
    expect(wires).toContain(wire('both', 'x:path:right', 'r'));
    expect(wires).toContain(wire('l', 'x:next', 'meet'));
    expect(wires).not.toContain(wire('r', 'x:next', 'meet'));
  });

  it('lights every wire into a merge that ran, and the one after it', () => {
    const wires = taken(scene, [
      record('both', { seq: 2 }),
      record('l', { seq: 3 }),
      record('r', { seq: 4 }),
      record('meet', { seq: 5 }),
      record('after', { seq: 6 }),
    ]);
    expect(wires).toContain(wire('l', 'x:next', 'meet'));
    expect(wires).toContain(wire('r', 'x:next', 'meet'));
    expect(wires).toContain(wire('meet', 'x:next', 'after'));
  });

  it('counts the finished paths of a Wait for all', () => {
    const progress = (records: readonly Activation[]): string =>
      progressText(
        joinProgress({ scene, records, iterations: new Map() }).get(idOf('meet')) ?? {
          done: -1,
          total: -1,
        },
      );
    expect(progress([])).toBe('0 of 2 done');
    expect(progress([record('l', { seq: 3 }), record('r', { seq: 4, status: 'running' })])).toBe(
      '1 of 2 done',
    );
    expect(progress([record('l', { seq: 3 }), record('r', { seq: 4 })])).toBe('2 of 2 done');
  });

  it('lights the merge wire only for the source that ran in this pass', () => {
    const merged = sceneOf(decisionProgram());
    const wires = taken(merged, [
      record('start', { seq: 1 }),
      record('dim', { seq: 3 }),
      record('check', { seq: 4 }),
      record('after', { seq: 5 }),
    ]);
    expect(wires).toContain(wire('dim', 'x:next', 'after'));
    expect(wires).not.toContain(wire('lamp', 'x:next', 'after'));
  });
});

describe('takenWires in loops', () => {
  const scene = sceneOf(loopProgram());

  it('lights the body wire for the chosen pass only', () => {
    const records = [
      record('start', { seq: 1 }),
      record('show', { seq: 3, loops: [['each', 2]] }),
      record('each', { seq: 5 }),
      record('done', { seq: 6 }),
    ];
    const body = wire('each', 'x:body', 'show');
    expect(taken(scene, records, new Map([[idOf('each'), 1]]))).not.toContain(body);
    expect(taken(scene, records, new Map([[idOf('each'), 2]]))).toContain(body);
    expect(taken(scene, records)).toContain(body);
  });

  it('lights the wire out of the loop after its last pass', () => {
    const wires = taken(
      scene,
      [record('each', { seq: 5 }), record('done', { seq: 6 })],
      new Map([[idOf('each'), 1]]),
    );
    expect(wires).toContain(wire('each', 'x:next', 'done'));
  });

  it('keeps passes apart: a record of another pass never lights a wire', () => {
    const wires = taken(
      scene,
      [
        record('start', { seq: 1 }),
        record('each', { seq: 5 }),
        record('show', { seq: 3, loops: [['each', 1]] }),
      ],
      new Map([[idOf('each'), 2]]),
    );
    expect(wires).not.toContain(wire('each', 'x:body', 'show'));
  });
});

describe('takenWires on triggers', () => {
  it('lights no trigger wire because triggers keep no record', () => {
    const scene = sceneOf(admitProgram());
    const wires = taken(scene, [record('start', { seq: 1 })]);
    expect(wires.filter((id) => id.includes(idOf('first')) || id.includes(idOf('second')))).toEqual(
      [],
    );
  });

  it('lights the wire from Start and the only trigger once the first step ran', () => {
    const scene = sceneOf(decisionProgram());
    const wires = taken(scene, [record('check', { seq: 1 })]);
    expect(wires).toContain(wire('start', 'x:next', 'check'));
    expect(wires).toContain(wire('tick', 'x:next', 'start'));
  });

  it('lights nothing for a run without records', () => {
    expect(taken(sceneOf(decisionProgram()), [])).toEqual([]);
  });
});

describe('takenWires from stored run records', () => {
  it('lights the row that ran, from records that carry no chosen row', () => {
    const wires = taken(sceneOf(decisionProgram()), [
      runRecord('start', 1),
      runRecord('lamp', 3),
      runRecord('check', 4),
      runRecord('after', 5),
    ]);
    expect(wires).toContain(wire('check', `x:row:${idOf('check:dark')}`, 'lamp'));
    expect(wires).not.toContain(wire('check', 'x:else', 'dim'));
    expect(wires).toContain(wire('lamp', 'x:next', 'after'));
    expect(wires).not.toContain(wire('dim', 'x:next', 'after'));
  });

  it('lights the Otherwise row from stored records', () => {
    const wires = taken(sceneOf(decisionProgram()), [
      runRecord('start', 1),
      runRecord('dim', 3),
      runRecord('check', 4),
      runRecord('after', 5),
    ]);
    expect(wires).toContain(wire('check', 'x:else', 'dim'));
    expect(wires).not.toContain(wire('check', `x:row:${idOf('check:dark')}`, 'lamp'));
  });

  it('lights the case of a Switch from stored records', () => {
    const wires = taken(sceneOf(switchProgram()), [
      runRecord('start', 1),
      runRecord('b', 2),
      runRecord('mode', 3),
    ]);
    expect(wires).toContain(wire('mode', `x:case:${idOf('mode:dim')}`, 'b'));
    expect(wires).not.toContain(wire('mode', 'x:default', 'c'));
  });

  it('lights the row that went straight to the merge when the other row had steps that did not run', () => {
    const merged = automation([
      start('check'),
      reading('sensor'),
      gnode('check', 'flow.if', {
        branches: [
          {
            id: idOf('check:dark'),
            when: valueWire('sensor', 'value'),
            to: 'lamp',
          },
        ],
        to: { else: 'after' },
      }),
      note('lamp', 'after'),
      note('after'),
    ]);
    const wires = taken(sceneOf(merged), [
      runRecord('start', 1),
      runRecord('check', 2),
      runRecord('after', 3),
    ]);
    expect(wires).toContain(wire('check', 'x:else', 'after'));
    expect(wires).not.toContain(wire('check', `x:row:${idOf('check:dark')}`, 'lamp'));
    expect(wires).not.toContain(wire('lamp', 'x:next', 'after'));
  });
});

describe('takenWires on exits wired straight into a merge', () => {
  const guarded = automation([
    start('only'),
    reading('sensor'),
    gnode('only', 'flow.guard', {
      ports: { condition: valueWire('sensor', 'value') },
      to: { next: 'work', otherwise: 'meet' },
    }),
    note('work', 'meet'),
    note('meet'),
  ]);
  const cooled = automation([
    start('pace'),
    gnode('pace', 'timing.cooldown', {
      ports: { period: { lit: 60000 } },
      to: { next: 'work', blocked: 'meet' },
    }),
    note('work', 'meet'),
    note('meet'),
  ]);

  it.each([
    ['guard', guarded, 'only', 'otherwise'],
    ['cooldown', cooled, 'pace', 'blocked'],
  ])('%s: lights Then and not the other exit when Then ran', (_name, program, key, other) => {
    const wires = taken(sceneOf(program), [
      runRecord('start', 1),
      runRecord(key, 2),
      runRecord('work', 3),
      runRecord('meet', 4),
    ]);
    expect(wires).toContain(wire(key, 'x:next', 'work'));
    expect(wires).toContain(wire('work', 'x:next', 'meet'));
    expect(wires).not.toContain(wire(key, `x:${other}`, 'meet'));
  });

  it.each([
    ['guard', guarded, 'only', 'otherwise'],
    ['cooldown', cooled, 'pace', 'blocked'],
  ])(
    '%s: lights the other exit and not Then when the run went round',
    (_name, program, key, other) => {
      const wires = taken(sceneOf(program), [
        runRecord('start', 1),
        runRecord(key, 2),
        runRecord('meet', 3),
      ]);
      expect(wires).toContain(wire(key, `x:${other}`, 'meet'));
      expect(wires).not.toContain(wire(key, 'x:next', 'work'));
      expect(wires).not.toContain(wire('work', 'x:next', 'meet'));
    },
  );

  it.each([
    ['guard', guarded, 'only', 'otherwise'],
    ['cooldown', cooled, 'pace', 'blocked'],
  ])(
    '%s: does not light the merge wire of an exit while the merge has not run',
    (_name, program, key, other) => {
      const wires = taken(sceneOf(program), [
        runRecord('start', 1),
        runRecord(key, 2),
        runRecord('work', 3, 'running'),
      ]);
      expect(wires).toContain(wire(key, 'x:next', 'work'));
      expect(wires).not.toContain(wire(key, `x:${other}`, 'meet'));
    },
  );
});
