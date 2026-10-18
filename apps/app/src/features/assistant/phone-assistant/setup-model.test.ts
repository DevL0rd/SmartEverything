import { describe, expect, it } from 'vitest';
import {
  readinessLine,
  setupProgress,
  setupSteps,
  type SetupFacts,
  type SetupStep,
  type SetupStepId,
} from './setup-model';

const NONE: SetupFacts = {
  assistant: false,
  sideKey: false,
  canOpenSideKey: true,
  microphone: false,
  overlay: false,
  battery: false,
};

const ALL: SetupFacts = {
  assistant: true,
  sideKey: true,
  canOpenSideKey: true,
  microphone: true,
  overlay: true,
  battery: true,
};

function stepOf(facts: SetupFacts, id: SetupStepId): SetupStep {
  const step = setupSteps(facts).find((one) => one.id === id);
  if (step === undefined) throw new Error(`no step ${id}`);
  return step;
}

describe('the setup steps', () => {
  it('lists the five steps in the order a person does them', () => {
    expect(setupSteps(NONE).map((step) => step.id)).toEqual([
      'assistant',
      'side_key',
      'microphone',
      'overlay',
      'battery',
    ]);
  });

  it('marks a step done from the phone fact and offers its button only while it is not done', () => {
    expect(stepOf(NONE, 'microphone')).toMatchObject({
      state: 'todo',
      actions: [{ kind: 'allow_microphone' }],
    });
    expect(stepOf(ALL, 'microphone')).toMatchObject({ state: 'done', actions: [] });
    expect(stepOf({ ...NONE, overlay: true }, 'overlay').state).toBe('done');
    expect(stepOf({ ...NONE, battery: true }, 'battery').actions).toEqual([]);
    expect(stepOf({ ...NONE, assistant: true }, 'assistant').state).toBe('done');
  });

  it('says so when the app cannot check a fact instead of guessing', () => {
    const step = stepOf({ ...NONE, assistant: null }, 'assistant');
    expect(step.state).toBe('unknown');
    expect(step.actions).toEqual([]);
    expect(step.body).toContain('Update the app');
  });

  it('asks the person to confirm the side key because Android does not report it', () => {
    expect(stepOf(NONE, 'side_key').actions.map((action) => action.kind)).toEqual([
      'open_side_key_settings',
      'confirm_side_key',
    ]);
    expect(stepOf(NONE, 'side_key').body).toContain('does not report');
  });

  it('offers only the confirmation when the settings page cannot be opened', () => {
    const facts = { ...NONE, canOpenSideKey: false };
    expect(stepOf(facts, 'side_key').actions.map((action) => action.kind)).toEqual([
      'confirm_side_key',
    ]);
  });

  it('lets the person take the confirmation back', () => {
    const step = stepOf({ ...NONE, sideKey: true }, 'side_key');
    expect(step.state).toBe('done');
    expect(step.actions.map((action) => action.kind)).toEqual(['undo_side_key']);
  });
});

describe('the readiness', () => {
  it('counts what is done and names the next step', () => {
    const progress = setupProgress(setupSteps({ ...NONE, assistant: true, microphone: true }));
    expect(progress).toMatchObject({ done: 2, total: 5, ready: false });
    expect(progress.next?.id).toBe('side_key');
    expect(readinessLine(progress)).toBe('Next: Side key long press');
  });

  it('is ready only when every step is done', () => {
    const progress = setupProgress(setupSteps(ALL));
    expect(progress).toMatchObject({ done: 5, ready: true, next: null });
    expect(readinessLine(progress)).toBe('Press and hold the side key to start a call.');
  });

  it('is not ready while a fact is unknown', () => {
    const progress = setupProgress(setupSteps({ ...ALL, overlay: null }));
    expect(progress.ready).toBe(false);
    expect(readinessLine(progress)).toBe('Update the app to finish setting up.');
  });
});
