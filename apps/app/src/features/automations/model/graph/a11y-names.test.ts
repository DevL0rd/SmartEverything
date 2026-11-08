import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { ProgramV4 } from '@smarteverything/domain';
import { a11yNames } from './a11y-names';
import {
  admitProgram,
  decisionProgram,
  earlyEndProgram,
  failureProgram,
  forkProgram,
  guardProgram,
  idOf,
  inputsProgram,
  laneRowsProgram,
  loopProgram,
  switchProgram,
  tryProgram,
} from './graph-scene-fixtures';
import { projectGraphScene } from './project-graph-scene';
import type { GraphScene } from './scene-contract';
import { EMPTY_GRAPH_RUN_OVERLAY } from './run-overlay';

function sceneOf(program: ProgramV4): GraphScene {
  return projectGraphScene(program, { direction: 'ltr', kinds: STATIC_KIND_LOOKUP });
}

function nameOf(program: ProgramV4, key: string, scene = sceneOf(program)): string {
  const name = a11yNames(scene).get(idOf(key));
  if (name === undefined) throw new Error(`no name for ${key}`);
  return name;
}

describe('a11yNames cards', () => {
  it('names a step with its place, category, exit, source and inputs', () => {
    expect(nameOf(decisionProgram(), 'dim')).toBe(
      'Step 2 of 4, Activity feed note, Notify. Then goes to Activity feed note. Comes from If, Otherwise. Inputs: message dim.',
    );
  });

  it('numbers steps in the structured order of the scene and counts only steps', () => {
    const scene = sceneOf(decisionProgram());
    const names = a11yNames(scene);
    const steps = scene.nodes
      .filter((node) => !['trigger', 'start', 'value'].includes(node.family))
      .map((node) => names.get(node.id) ?? '');
    steps.forEach((name, index) => {
      expect(name.startsWith(`Step ${String(index + 1)} of ${String(steps.length)}, `)).toBe(true);
    });
  });

  it('names triggers, Start and the failure start', () => {
    expect(nameOf(admitProgram(), 'second')).toMatch(
      /^Trigger 2 of 2, Every, Triggers\. Then goes to Start\./,
    );
    expect(nameOf(admitProgram(), 'start')).toContain('Comes from Every; Every.');
    expect(nameOf(admitProgram(), 'start')).toContain('Inputs: only start if from Device value.');
    expect(nameOf(failureProgram(), 'failure')).toMatch(
      /^If the run fails, On failure\. Then goes to /,
    );
  });

  it('names a value card by the cards that use it', () => {
    expect(nameOf(decisionProgram(), 'sensor')).toMatch(
      /^Value, Device value, Devices\. Used by If\./,
    );
  });

  it('says where a wired input comes from', () => {
    expect(nameOf(loopProgram(), 'show')).toContain('Inputs: message from For each.');
    expect(nameOf(inputsProgram(), 'show')).toContain('Inputs: message from Start.');
  });

  it('uses no ids', () => {
    for (const program of [decisionProgram(), forkProgram('all'), loopProgram(), tryProgram()]) {
      for (const name of a11yNames(sceneOf(program)).values()) {
        expect(name).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
        expect(name).not.toMatch(/\b(?:x|v|o):/);
      }
    }
  });
});

describe('a11yNames decisions and exits', () => {
  it('lists each branch of an If and where it goes', () => {
    expect(nameOf(decisionProgram(), 'check')).toBe(
      'Step 1 of 4, If, Flow. Branches: If Device value goes to Activity feed note; Otherwise goes to Activity feed note. Comes from Start.',
    );
  });

  it('says a branch that ends early ends the run', () => {
    expect(nameOf(earlyEndProgram(), 'check')).toContain('Otherwise ends the run.');
  });

  it('lists the cases and the default of a Switch', () => {
    const name = nameOf(switchProgram(), 'mode');
    expect(name).toContain(
      'Branches: Is bright goes to Activity feed note; Is dim goes to Activity feed note; Default goes to Activity feed note.',
    );
    expect(name).toContain('Inputs: subject mode.');
  });

  it('names the guard continuation before its Otherwise branch', () => {
    expect(nameOf(guardProgram(), 'only')).toContain(
      'Then goes to Activity feed note. Branches: Otherwise ends the run.',
    );
  });

  it('lists the lanes of an owner, a Try and a Do together', () => {
    expect(nameOf(tryProgram(), 'guarded')).toContain(
      'Lanes: Try goes to Activity feed note; If it fails goes to Activity feed note; Finally goes to Activity feed note.',
    );
    expect(nameOf(forkProgram('all'), 'both')).toContain(
      'Lanes: Left goes to Activity feed note; Right goes to Activity feed note.',
    );
    expect(nameOf(loopProgram(), 'each')).toContain(
      'When done goes to Activity feed note. Lanes: Each item goes to Activity feed note.',
    );
  });

  it('names where a lane came from', () => {
    expect(nameOf(forkProgram('all'), 'l')).toContain('Comes from Do together, Left.');
    expect(nameOf(laneRowsProgram(), 'late')).toContain('Comes from Wait for event, Timed out.');
  });

  it('names a merge by every wire that leads into it', () => {
    expect(nameOf(forkProgram('all'), 'meet')).toContain(
      'Comes from Activity feed note; Activity feed note.',
    );
  });
});

describe('a11yNames lane ends', () => {
  it('says the last card of a lane ends the pass and where the pass goes', () => {
    expect(nameOf(loopProgram(), 'show')).toContain('Then ends the pass, next item.');
    expect(nameOf(tryProgram(), 'risky')).toContain('Then ends the pass, back to Try.');
    expect(nameOf(laneRowsProgram(), 'inside')).toContain('Then ends the pass, carry on.');
  });

  it('says the end of the top level ends the run', () => {
    expect(nameOf(loopProgram(), 'done')).toContain('Then ends the run.');
  });
});

describe('a11yNames long names, problems and the run', () => {
  it('keeps a long title whole', () => {
    const long = `Kitchen ${'very '.repeat(60)}lamp`;
    const scene = sceneOf(decisionProgram());
    const titled: GraphScene = {
      ...scene,
      nodes: scene.nodes.map((node) => (node.key === 'lamp' ? { ...node, title: long } : node)),
    };
    const name = nameOf(decisionProgram(), 'check', titled);
    expect(name).toContain(`goes to ${long}`);
    expect(nameOf(decisionProgram(), 'lamp', titled)).toContain(long);
  });

  it('adds the problems of a card', () => {
    const scene = sceneOf(decisionProgram());
    const flagged: GraphScene = {
      ...scene,
      nodes: scene.nodes.map((node) =>
        node.key === 'dim'
          ? {
              ...node,
              problems: [{ code: 'x', message: 'Nothing is connected', fix: 'Connect it' }],
            }
          : node,
      ),
    };
    expect(nameOf(decisionProgram(), 'dim', flagged)).toContain('Problem: Nothing is connected.');
  });

  it('adds the run state, the failure, the wake time and the progress', () => {
    const scene = sceneOf(forkProgram('all'));
    const run = {
      ...EMPTY_GRAPH_RUN_OVERLAY,
      nodes: {
        [idOf('l')]: { state: 'failed' as const, text: 'Unreachable' },
        [idOf('r')]: { state: 'waiting' as const, wakeAt: '2026-10-19T10:30:00.000Z' },
        [idOf('meet')]: { state: 'waiting' as const, progress: { done: 1, total: 2 } },
        [idOf('both')]: { state: 'done' as const },
      },
    };
    const names = a11yNames(scene, { run, zone: 'UTC' });
    expect(names.get(idOf('l'))).toMatch(/Failed: Unreachable\.$/);
    expect(names.get(idOf('r'))).toMatch(/Waiting, wakes at 10:30/);
    expect(names.get(idOf('meet'))).toMatch(/Waiting, 1 of 2 done\.$/);
    expect(names.get(idOf('both'))).toMatch(/Done\.$/);
    expect(names.get(idOf('after'))).not.toMatch(/Done|Waiting|Running/);
  });
});
