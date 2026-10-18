import { describe, expect, it } from 'vitest';
import type { StepV2 } from '@smarteverything/domain';
import { blankStep } from './blanks';
import { catalogFixture, PERSON_ID } from './catalog-fixture';
import { describeStep } from './describe-steps';
import { speechOf, speechStep, type ToolStep } from './speak-step';
import { DEVICES, LAMP } from './test-devices';
import { stepProblems, type ValidationChoices } from './validate-steps';

const CAMERA = LAMP;
const GONE = '40000000-0000-4000-8000-0000000000ff';
const STEP = '40000000-0000-4000-8000-000000000002';

const CHOICES: ValidationChoices = {
  devices: DEVICES,
  sceneIds: [],
  profileIds: [PERSON_ID],
  valueIds: [],
  groupIds: [],
  roomIds: [],
  automationIds: [],
  callable: [],
  inputs: [],
};

function speak(text: string, deviceId = CAMERA): ToolStep {
  return speechStep({ do: 'tool', id: STEP, person: PERSON_ID, tool: 'speak' }, { deviceId, text });
}

describe('a spoken step on a camera speaker', () => {
  it('stores the exact arguments the speak tool takes and reads them back', () => {
    const step = speak('Dinner is ready');
    expect(step.args).toStrictEqual({
      target: { kind: 'device', deviceId: CAMERA },
      text: 'Dinner is ready',
    });
    expect(speechOf(step)).toStrictEqual({ deviceId: CAMERA, text: 'Dinner is ready' });
  });

  it('leaves other tools and unfamiliar arguments to the generic tool form', () => {
    expect(speechOf({ do: 'tool', id: STEP, person: PERSON_ID, tool: 'run_scene' })).toBeNull();
    expect(
      speechOf({
        do: 'tool',
        id: STEP,
        person: PERSON_ID,
        tool: 'speak',
        args: { target: { kind: 'channel', channelId: CAMERA }, text: 'Hi' },
      }),
    ).toBeNull();
  });

  it('starts on the first camera with a speaker and needs the owner', () => {
    const fixture = catalogFixture();
    expect(fixture.speakers.length).toBeGreaterThan(0);
    expect(blankStep('speak', fixture)).toMatchObject({ do: 'tool', tool: 'speak' });
    expect(blankStep('speak', catalogFixture({ speakers: [] }))).toBeNull();
    expect(blankStep('speak', catalogFixture({ wakeProfileId: null }))).toBeNull();
    expect(blankStep('tool', catalogFixture({ wakeProfileId: null }))).toBeNull();
  });

  it('is described in words with the camera name', () => {
    expect(describeStep(catalogFixture().names, speak('Dinner is ready'))).toBe(
      'say “Dinner is ready” on Hallway light',
    );
  });

  it('asks for words and a camera that is still here', () => {
    expect(stepProblems(CHOICES, speak('  '))).toStrictEqual(['Write what to say.']);
    expect(stepProblems(CHOICES, speak('Hello', GONE))).toStrictEqual([
      'uses a device that is no longer here',
    ]);
    expect(stepProblems(CHOICES, speak('Hello'))).toStrictEqual([]);
  });
});

describe('a generic tool step', () => {
  const bare: StepV2 = { do: 'tool', id: STEP, person: PERSON_ID, tool: '' };

  it('asks for a tool until one is picked', () => {
    expect(stepProblems(CHOICES, bare)).toStrictEqual(['Pick the tool to use.']);
    expect(stepProblems(CHOICES, { ...bare, tool: 'control_devices' })).toStrictEqual([]);
  });

  it('refuses a person who was removed', () => {
    expect(stepProblems({ ...CHOICES, profileIds: [] }, { ...bare, tool: 'x' })).toStrictEqual([
      'uses a tool for someone who was removed',
    ]);
  });
});
