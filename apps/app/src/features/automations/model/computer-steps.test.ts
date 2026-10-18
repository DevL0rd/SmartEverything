import { describe, expect, it } from 'vitest';
import { AUTOMATION_V2, type ComputerFeature, type StepV2 } from '@smarteverything/domain';
import {
  AUDIO_ACTIONS,
  DISPLAY_ACTIONS,
  audioActionOffered,
  blankAudioChange,
  blankDisplayChange,
  computersOf,
  displayActionOffered,
  keepable,
  withoutKeep,
  type AudioStep,
  type DisplayStep,
} from './computer-steps';
import { computerTemplates } from './computer-templates';
import { COMPUTER_ID, catalogFixture, computerDevice, withComputer } from './catalog-fixture';
import { describeStep } from './describe-steps';
import { stepProblems, type ValidationChoices } from './validate-steps';
import { DEVICES, LAMP } from './test-devices';
import { validateDraft } from './validate';

const NAMES = withComputer(catalogFixture()).names;

const CHOICES: ValidationChoices = {
  devices: [...DEVICES, computerDevice()],
  sceneIds: [],
  profileIds: [],
  valueIds: [],
  groupIds: [],
  roomIds: [],
  automationIds: [],
  callable: [],
  inputs: [],
};

function audio(change: AudioStep['change'], computer = COMPUTER_ID): AudioStep {
  return { do: 'audio', computer, change };
}

function display(change: DisplayStep['change'], keep?: boolean): DisplayStep {
  return {
    do: 'display',
    computer: COMPUTER_ID,
    change,
    ...(keep === undefined ? {} : { keep }),
  };
}

function parses(step: StepV2): boolean {
  return AUTOMATION_V2.safeParse({ when: [], steps: [step] }).success;
}

describe('blank computer changes', () => {
  it('start every sound action with a change the schema accepts once it is named', () => {
    for (const { value } of AUDIO_ACTIONS) {
      const change = blankAudioChange(value);
      expect(change.action).toBe(value);
    }
    expect(parses(audio(blankAudioChange('volume')))).toBe(true);
    expect(parses(audio({ action: 'app_mute', app: 'Spotify', muted: true }))).toBe(true);
  });

  it('start every screen action the editor offers', () => {
    for (const { value } of DISPLAY_ACTIONS) {
      expect(blankDisplayChange(value).action).toBe(value);
    }
    expect(parses(display(blankDisplayChange('brightness')))).toBe(true);
    expect(parses(display(blankDisplayChange('night_light')))).toBe(true);
  });

  it('only find computers among the devices', () => {
    expect(computersOf([...DEVICES, computerDevice()]).map((device) => device.id)).toEqual([
      COMPUTER_ID,
    ]);
  });
});

describe('actions a computer offers', () => {
  const none: readonly ComputerFeature[] = [];

  it('show everything while the computer’s features are unknown', () => {
    for (const { value } of AUDIO_ACTIONS) expect(audioActionOffered(undefined, value)).toBe(true);
    for (const { value } of DISPLAY_ACTIONS)
      expect(displayActionOffered(undefined, value)).toBe(true);
  });

  it('hide what the computer does not advertise', () => {
    expect(audioActionOffered(none, 'volume')).toBe(false);
    expect(audioActionOffered(['audio'], 'volume')).toBe(true);
    expect(audioActionOffered(['audio'], 'app_volume')).toBe(false);
    expect(audioActionOffered(['audio', 'audio_apps'], 'app_output')).toBe(true);
    expect(displayActionOffered(['displays'], 'brightness')).toBe(false);
    expect(displayActionOffered(['displays'], 'scale')).toBe(true);
    expect(displayActionOffered(['displays', 'night_light'], 'night_light')).toBe(true);
    expect(displayActionOffered(['displays'], 'mode')).toBe(false);
  });
});

describe('keeping a screen change', () => {
  it('is offered for resolution, scale and position only, and dropped when the action changes', () => {
    expect(keepable(blankDisplayChange('mode'))).toBe(true);
    expect(keepable(blankDisplayChange('scale'))).toBe(true);
    expect(keepable(blankDisplayChange('position'))).toBe(true);
    expect(keepable(blankDisplayChange('brightness'))).toBe(false);
    expect(keepable(blankDisplayChange('night_light'))).toBe(false);
    const kept = display(blankDisplayChange('mode'), true);
    expect(withoutKeep(kept)).not.toHaveProperty('keep');
  });
});

describe('describing computer steps', () => {
  it('words whole-computer and per-app sound changes', () => {
    expect(describeStep(NAMES, audio({ action: 'volume', level: 30, kind: 'output' }))).toBe(
      'set the volume on Desk PC to 30%',
    );
    expect(describeStep(NAMES, audio({ action: 'mute', muted: true, kind: 'input' }))).toBe(
      'mute the microphone on Desk PC',
    );
    expect(
      describeStep(NAMES, audio({ action: 'default', kind: 'output', device: 'Headset' })),
    ).toBe('make Headset the default output on Desk PC');
    expect(describeStep(NAMES, audio({ action: 'app_volume', app: 'Spotify', level: 20 }))).toBe(
      'set Spotify’s volume on Desk PC to 20%',
    );
    expect(describeStep(NAMES, audio({ action: 'app_mute', app: 'Firefox', muted: false }))).toBe(
      'unmute Firefox on Desk PC',
    );
    expect(
      describeStep(NAMES, audio({ action: 'app_output', app: 'Spotify', output: 'Headset' })),
    ).toBe('play Spotify through Headset on Desk PC');
    expect(describeStep(NAMES, audio(blankAudioChange('app_mute')))).toBe('mute an app on Desk PC');
  });

  it('words each screen change and says when it is kept', () => {
    expect(
      describeStep(
        NAMES,
        display({ action: 'mode', output: 'DP-1', width: 2560, height: 1440, refreshHz: 144 }),
      ),
    ).toBe('set DP-1 on Desk PC to 2560×1440 at 144 Hz');
    expect(
      describeStep(NAMES, display({ action: 'scale', output: 'DP-1', percent: 125 }, true)),
    ).toBe('set the scale of DP-1 on Desk PC to 125%, and keep it');
    expect(describeStep(NAMES, display({ action: 'brightness', level: 40 }))).toBe(
      'set the brightness of every screen on Desk PC to 40%',
    );
    expect(
      describeStep(NAMES, display({ action: 'night_light', mode: 'on', temperatureKelvin: 3500 })),
    ).toBe('turn night light on at 3500 K on Desk PC');
    expect(
      describeStep(
        NAMES,
        display({ action: 'position', output: 'TV', relativeTo: 'DP-1', side: 'left' }),
      ),
    ).toBe('place TV to the left of DP-1 on Desk PC');
  });

  it('names a removed computer plainly', () => {
    expect(
      describeStep(
        NAMES,
        audio({ action: 'volume', level: 1, kind: 'output' }, LAMP.replace('2', '9')),
      ),
    ).toBe('set the volume on a removed device to 1%');
  });
});

describe('problems in computer steps', () => {
  it('accept a complete step', () => {
    expect(stepProblems(CHOICES, audio({ action: 'volume', level: 30, kind: 'output' }))).toEqual(
      [],
    );
    expect(
      stepProblems(CHOICES, display({ action: 'mode', output: 'DP-1', width: 1920, height: 1080 })),
    ).toEqual([]);
  });

  it('name what is missing', () => {
    expect(stepProblems(CHOICES, audio(blankAudioChange('app_volume')))).toEqual(['Name the app.']);
    expect(stepProblems(CHOICES, audio(blankAudioChange('default')))).toEqual([
      'Name the device to make the default.',
    ]);
    expect(stepProblems(CHOICES, audio(blankAudioChange('app_output')))).toEqual(['Name the app.']);
    expect(stepProblems(CHOICES, audio({ action: 'app_output', app: 'x', output: '' }))).toEqual([
      'Name the output the app should use.',
    ]);
    expect(stepProblems(CHOICES, display(blankDisplayChange('mode')))).toEqual([
      'Pick the screen.',
    ]);
    expect(stepProblems(CHOICES, display(blankDisplayChange('position')))).toEqual([
      'Pick both screens.',
    ]);
  });

  it('keep values inside what the computer accepts', () => {
    expect(stepProblems(CHOICES, audio({ action: 'volume', level: 200, kind: 'output' }))).toEqual([
      'Volume is between 0 and 150 percent.',
    ]);
    expect(stepProblems(CHOICES, display({ action: 'brightness', level: 120 }))).toEqual([
      'Brightness is between 0 and 100 percent.',
    ]);
    expect(
      stepProblems(CHOICES, display({ action: 'scale', output: 'DP-1', percent: 20 })),
    ).toEqual(['Scale is between 50 and 400 percent.']);
    expect(
      stepProblems(CHOICES, display({ action: 'night_light', mode: 'on', temperatureKelvin: 20 })),
    ).toEqual(['Night light warmth is a whole number between 1000 and 6500 K.']);
    expect(
      stepProblems(CHOICES, display({ action: 'mode', output: 'DP-1', width: 0, height: 1080 })),
    ).toEqual(['Width and height are whole numbers above zero.']);
    expect(
      stepProblems(
        CHOICES,
        display({ action: 'position', output: 'DP-1', relativeTo: 'DP-1', side: 'left' }),
      ),
    ).toEqual(['Pick two different screens.']);
  });

  it('report a computer that is gone or is not a computer', () => {
    const gone = audio(
      { action: 'volume', level: 1, kind: 'output' },
      '99999999-0000-4000-8000-000000000000',
    );
    expect(stepProblems(CHOICES, gone)).toEqual(['uses a computer that is no longer here']);
    const lamp = audio({ action: 'volume', level: 1, kind: 'output' }, LAMP);
    expect(stepProblems(CHOICES, lamp)).toEqual(['Hallway light is not a computer']);
  });
});

describe('ideas for computers', () => {
  const devices = [...DEVICES, computerDevice()];

  it('appear only for what the computer advertises', () => {
    expect(computerTemplates(devices, new Map())).toEqual([]);
    expect(
      computerTemplates(devices, new Map([[COMPUTER_ID, ['audio'] as const]])).map(
        (template) => template.title,
      ),
    ).toEqual(['Turn Desk PC down at bedtime']);
    expect(
      computerTemplates(
        devices,
        new Map([[COMPUTER_ID, ['audio', 'brightness', 'night_light'] as const]]),
      ).map((template) => template.id),
    ).toEqual([
      `computer-quiet:${COMPUTER_ID}`,
      `computer-dim:${COMPUTER_ID}`,
      `computer-warm:${COMPUTER_ID}`,
    ]);
  });

  it('build drafts that validate against the schema and the devices', () => {
    const templates = computerTemplates(
      devices,
      new Map([[COMPUTER_ID, ['audio', 'brightness', 'night_light'] as const]]),
    );
    expect(templates).toHaveLength(3);
    for (const template of templates) {
      expect(validateDraft(template.draft, CHOICES, { reusable: false }).valid).toBe(true);
    }
  });
});
