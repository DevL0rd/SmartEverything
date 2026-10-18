import { describe, expect, it } from 'vitest';
import type { AutomationV2 } from '@smarteverything/domain';
import { EMPTY_DRAFT, type Draft } from './editor-state';
import { validateDraft, type ValidationChoices } from './validate';
import { DEVICES, LAMP } from './test-devices';

const STEP = '60000000-0000-4000-8000-000000000001';
const INNER = '60000000-0000-4000-8000-000000000002';
const CASE = '60000000-0000-4000-8000-000000000003';
const GONE = '60000000-0000-4000-8000-0000000000ff';

const CHOICES: ValidationChoices = {
  devices: DEVICES,
  sceneIds: [],
  profileIds: [],
  valueIds: [],
  groupIds: [],
  roomIds: [],
  automationIds: [],
  callable: [],
  inputs: [],
};

function draft(automation: AutomationV2, name = 'Test'): Draft {
  return { ...EMPTY_DRAFT, name, automation };
}

const TIME = { on: 'time', at: '07:00' } as const;
const ON = { do: 'set', id: STEP, target: { device: LAMP }, control: 'power', to: true } as const;

describe('validating a draft', () => {
  it('accepts a complete program', () => {
    const result = validateDraft(draft({ when: [TIME], steps: [ON] }), CHOICES, {
      reusable: false,
    });
    expect(result).toMatchObject({ valid: true, name: 'Test' });
  });

  it('asks for a name, a trigger and a step in plain words', () => {
    const result = validateDraft(draft({ when: [], steps: [] }, ' '), CHOICES, {
      reusable: false,
    });
    expect(result.valid).toBe(false);
    if (!result.valid)
      expect(result.problems).toMatchObject({
        name: ['Give it a name.'],
        when: ['Add when it runs.'],
        then: ['Add what it does.'],
      });
  });

  it('lets reusable steps have no trigger', () => {
    const result = validateDraft(draft({ when: [], steps: [ON] }), CHOICES, { reusable: true });
    expect(result.valid).toBe(true);
  });

  it('marks the step that uses a device that is gone, even deep inside an If', () => {
    const inner = { ...ON, id: INNER, target: { device: GONE } };
    const program: AutomationV2 = {
      when: [TIME],
      steps: [
        {
          do: 'if',
          id: STEP,
          branches: [{ id: CASE, when: { time: { days: [1] } }, then: [inner] }],
        },
      ],
    };
    const result = validateDraft(draft(program), CHOICES, { reusable: false });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(Object.keys(result.problems.nodes)).toEqual([INNER]);
      expect(result.problems.nodes[INNER]?.[0]).toMatch(/device that is no longer here/);
    }
  });

  it('marks a step whose value the device would refuse', () => {
    const bad = { ...ON, control: 'purifier_mode' as const, to: 'turbo' };
    const result = validateDraft(draft({ when: [TIME], steps: [bad] }), CHOICES, {
      reusable: false,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.problems.nodes[STEP]).toHaveLength(1);
  });

  it('asks for the message and the instruction a step needs', () => {
    const notify = { do: 'notify', id: STEP, message: '  ' } as const;
    const result = validateDraft(draft({ when: [TIME], steps: [notify] }), CHOICES, {
      reusable: false,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.problems.nodes[STEP]).toEqual(['Write the message to send.']);
  });

  it('keeps a case that is always true and flags a missing scene', () => {
    const program: AutomationV2 = {
      when: [TIME],
      steps: [
        { do: 'if', id: STEP, branches: [{ id: CASE, when: { all: [] }, then: [] }] },
        { do: 'scene', id: INNER, scene: GONE },
      ],
    };
    const result = validateDraft(draft(program), CHOICES, { reusable: false });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(Object.keys(result.problems.nodes)).toEqual([INNER]);
      expect(result.problems.nodes[INNER]?.[0]).toMatch(/scene that was deleted/);
    }
  });

  it('numbers trigger problems and points at conditions that read a missing thing', () => {
    const program: AutomationV2 = {
      when: [{ on: 'speech', phrase: ' ' }],
      onlyIf: { all: [{ compare: { value: GONE }, test: { is: 'eq', to: 1 } }] },
      steps: [ON],
    };
    const result = validateDraft(draft(program), CHOICES, { reusable: false });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.problems.when[0]).toMatch(/^1\. /);
      expect(result.problems.only[0]).toMatch(/Value that was deleted/);
    }
  });

  it('keeps schema complaints for the step they belong to', () => {
    const loop = { do: 'repeat', id: STEP, times: 2, steps: [] } as const;
    const result = validateDraft(draft({ when: [TIME], steps: [loop] }), CHOICES, {
      reusable: false,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.problems.nodes[STEP]?.[0]).toMatch(/needs a step/);
  });
});
