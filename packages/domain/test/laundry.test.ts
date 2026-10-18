import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DEVICE_CAPABILITY,
  DRUM_CLEAN_PROGRAM_ID,
  LAUNDRY_DOORS,
  LAUNDRY_FAULTS,
  LAUNDRY_PHASES,
  LAUNDRY_PHASE_STEP_LABELS,
  LAUNDRY_PHASE_WORDS,
  LAUNDRY_PROGRAMS,
  LAUNDRY_RUN_STATUSES,
  LAUNDRY_STATUSES,
  LaundryRoleMissingError,
  LaundryValueError,
  dialPrograms,
  doorLine,
  doorReleaseAllowed,
  eventLabel,
  faultAdvice,
  formatLaundryMinutes,
  isLaundryRunning,
  isLaundryValueRole,
  laundryCommands,
  laundryDelayError,
  laundryFault,
  laundryPhase,
  laundryProgramById,
  laundryProgramByRaw,
  laundryProgramOptions,
  laundryReadiness,
  laundryRunPhase,
  laundryStage,
  LAUNDRY_DRAFT,
  laundryStartPlan,
  laundryValuesOf,
  minutesUntil,
  plannedPhases,
  type CapabilityKey,
  type JsonValue,
  type LaundryPhase,
  type LaundryValues,
} from '../src';

const CAPABILITIES = z
  .array(DEVICE_CAPABILITY)
  .parse(
    JSON.parse(
      readFileSync(new URL('fixtures/mibx5-f29gl-capabilities.json', import.meta.url), 'utf8'),
    ),
  );

const LIVE_DIAL = '0E18030B04120F113E44080D07494798';

const RUN_PHASES: Readonly<Record<string, LaundryPhase>> = {
  'Not Run': 'weighing',
  'Performing Scheduled Task': 'delayed',
  Weighing: 'weighing',
  Prewashing: 'prewash',
  'Steam Sterilization': 'steam',
  Soaking: 'soak',
  Washing: 'wash',
  Rinsing: 'rinse',
  'Anti-crease Soaking': 'soak',
  Spinning: 'spin',
  Drying: 'dry',
  'Cooling After Drying': 'cool',
  'Waiting Blow And Shake': 'anti_crease',
  'Blowing And Shaking': 'anti_crease',
  'Clothing Care': 'care',
  'Washing Completed': 'finished',
};

const FIXED_STATUS_PHASES: Readonly<Record<string, LaundryPhase>> = {
  Off: 'off',
  Idle: 'idle',
  Paused: 'paused',
  Delay: 'delayed',
  Completed: 'finished',
  'Clean Cavity Completed': 'drum_clean_done',
};

function optionsOf(key: string): readonly string[] {
  const value = CAPABILITIES.find((capability) => capability.key === key)?.value;
  return value?.kind === 'enum' ? value.options : [];
}

describe('laundry phase', () => {
  it('knows every status and run status the live machine reports', () => {
    expect([...LAUNDRY_STATUSES].sort()).toEqual([...optionsOf('raw:2.2')].sort());
    expect([...LAUNDRY_RUN_STATUSES].sort()).toEqual([...optionsOf('raw:2.11')].sort());
    expect([...LAUNDRY_DOORS].sort()).toEqual([...optionsOf('raw:2.9')].sort());
  });

  it('maps every non-busy status to its phase whatever the run status says', () => {
    for (const [status, phase] of Object.entries(FIXED_STATUS_PHASES)) {
      for (const run of LAUNDRY_RUN_STATUSES) {
        expect(
          laundryPhase({ laundry_status: status, laundry_phase: run }),
          `${status} / ${run}`,
        ).toBe(phase);
      }
    }
  });

  it('maps a busy machine by its run status', () => {
    for (const run of LAUNDRY_RUN_STATUSES) {
      expect(laundryPhase({ laundry_status: 'Busy', laundry_phase: run }), run).toBe(
        RUN_PHASES[run],
      );
    }
  });

  it('treats a busy machine without a run status as just started', () => {
    expect(laundryPhase({ laundry_status: 'Busy' })).toBe('weighing');
  });

  it('is unknown until the machine reports a status', () => {
    expect(laundryPhase({})).toBeNull();
    expect(laundryRunPhase({})).toBeNull();
    expect(laundryRunPhase({ laundry_phase: 'Not Run' })).toBeNull();
  });

  it('keeps the underlying step while paused', () => {
    const values = { laundry_status: 'Paused', laundry_phase: 'Rinsing' };
    expect(laundryPhase(values)).toBe('paused');
    expect(laundryRunPhase(values)).toBe('rinse');
  });

  it('refuses a status it does not know, naming what it expected', () => {
    expect(() => laundryPhase({ laundry_status: 'Exploding' })).toThrow(LaundryValueError);
    expect(() => laundryPhase({ laundry_status: 'Exploding' })).toThrow(/laundry_status/);
  });

  it('puts every phase on a graphic stage and marks the moving ones running', () => {
    expect(LAUNDRY_PHASES.map((phase) => laundryStage(phase))).toEqual([
      'rest',
      'rest',
      'rest',
      'tumble',
      'water',
      'water',
      'water',
      'water',
      'spin',
      'heat',
      'heat',
      'tumble',
      'heat',
      'heat',
      'rest',
      'done',
      'done',
    ]);
    expect(laundryStage('wash', true)).toBe('alert');
    expect(LAUNDRY_PHASES.filter(isLaundryRunning)).toEqual([
      'weighing',
      'prewash',
      'soak',
      'wash',
      'rinse',
      'spin',
      'dry',
      'cool',
      'anti_crease',
      'steam',
      'care',
    ]);
  });

  it('has a state word for every phase and a step label for every planned one', () => {
    expect(Object.keys(LAUNDRY_PHASE_WORDS).sort()).toEqual([...LAUNDRY_PHASES].sort());
    expect(Object.keys(LAUNDRY_PHASE_STEP_LABELS)).toHaveLength(11);
  });
});

describe('planned phases', () => {
  it('decodes the live mask 708 as weigh, wash, rinse, spin', () => {
    expect(plannedPhases(708)).toEqual(['weighing', 'wash', 'rinse', 'spin']);
  });

  it('adds drying, cooling and anti-crease in display order', () => {
    const mask = 2 ** 2 + 2 ** 6 + 2 ** 7 + 2 ** 9 + 2 ** 10 + 2 ** 11 + 2 ** 12;
    expect(plannedPhases(mask)).toEqual([
      'weighing',
      'wash',
      'rinse',
      'spin',
      'dry',
      'cool',
      'anti_crease',
    ]);
  });

  it('collapses the internal anti-crease soak and blow steps', () => {
    const mask = 2 ** 5 + 2 ** 8 + 2 ** 12 + 2 ** 13 + 2 ** 4 + 2 ** 14 + 2 ** 3;
    expect(plannedPhases(mask)).toEqual(['prewash', 'steam', 'soak', 'anti_crease', 'care']);
  });

  it('ignores the bits that are not steps and reports nothing before the machine does', () => {
    expect(plannedPhases(2 ** 0 + 2 ** 1 + 2 ** 15)).toEqual([]);
    expect(plannedPhases(undefined)).toEqual([]);
  });

  it('refuses a mask that is not a whole number', () => {
    expect(() => plannedPhases(-1)).toThrow(LaundryValueError);
    expect(() => plannedPhases('708')).toThrow(/laundry_phases/);
  });
});

describe('programs on the machine dial', () => {
  it('decodes the live dial into the 14 programs in dial order', () => {
    expect(dialPrograms(LIVE_DIAL).map((program) => program.label)).toEqual([
      'Smart',
      'Quick',
      'Intensive',
      'Delicate',
      'Cotton',
      'Wool',
      'Air refresh',
      'Hygiene (anti-allergen)',
      'Wash & dry',
      'Dry',
      'Drum clean',
      'Spin',
      '20 °C',
      'Eco 40-60',
    ]);
  });

  it('returns nothing when the dial text cannot be trusted', () => {
    const corrupt = ['', 'zz', LIVE_DIAL.slice(2), `0F${LIVE_DIAL.slice(2)}`];
    for (const text of corrupt) {
      expect(dialPrograms(text), text).toEqual([]);
    }
    expect(dialPrograms(`${LIVE_DIAL.slice(0, -2)}99`)).toEqual([]);
    expect(dialPrograms(7)).toEqual([]);
    expect(dialPrograms('01FF00')).toEqual([]);
    expect(dialPrograms('00')).toEqual([]);
  });

  it('refuses a dial that names a program the machine does not list', () => {
    expect(dialPrograms('01FE')).toEqual([]);
    expect(dialPrograms('01FEFF')).toEqual([]);
  });

  it('lists exactly the 34 programs the live machine accepts', () => {
    expect(LAUNDRY_PROGRAMS.map((program) => program.raw).sort()).toEqual(
      [...optionsOf('raw:2.3')].sort(),
    );
    expect(new Set(LAUNDRY_PROGRAMS.map((program) => program.id)).size).toBe(34);
  });

  it('finds a program by id and by the name the machine reports', () => {
    expect(laundryProgramById(71)?.label).toBe('Eco 40-60');
    expect(laundryProgramByRaw('ECO4060')?.id).toBe(71);
    expect(laundryProgramById(2)).toBeUndefined();
    expect(laundryProgramByRaw('nope')).toBeUndefined();
  });

  it('shows only the options a program uses', () => {
    const options = (raw: string): readonly string[] =>
      laundryProgramOptions(laundryProgramByRaw(raw) ?? LAUNDRY_PROGRAMS[0]!);
    expect(options('Spin')).toEqual(['spin', 'quiet']);
    expect(options('Dry')).toEqual(['dryMode', 'dryMinutes', 'dryTarget', 'quiet', 'antiCrease']);
    expect(options('Rinse Spin')).toEqual(['rinses', 'spin', 'quiet']);
    expect(options('ECO4060')).toEqual([
      'temperature',
      'soak',
      'steam',
      'extraWater',
      'rinses',
      'spin',
      'quiet',
      'antiCrease',
    ]);
    expect(options('User Define')).toContain('washMinutes');
    expect(options('Wash Dry')).toContain('dryMode');
    expect(options('Drum Clean')).toEqual([]);
    expect(laundryProgramById(DRUM_CLEAN_PROGRAM_ID)?.raw).toBe('Drum Clean');
  });
});

describe('readiness, door and faults', () => {
  const ready: LaundryValues = {
    power: true,
    remote_control: true,
    fault: 'No Faults',
    door_state: 'Closed And Can Be Opened',
  };

  it('allows a start when nothing is in the way', () => {
    expect(laundryReadiness(ready, true)).toBeNull();
    expect(laundryReadiness({}, true)).toBeNull();
  });

  it('applies the reasons in order: offline, off, remote, fault, door', () => {
    const everything: LaundryValues = {
      power: false,
      remote_control: false,
      fault: 'Water Draining Malfunction',
      door_state: 'Open',
    };
    expect(laundryReadiness(everything, false)).toBe('The washer is offline.');
    expect(laundryReadiness(everything, true)).toBe(
      'Switch on the machine and press its remote button.',
    );
    expect(laundryReadiness({ ...everything, power: true }, true)).toBe(
      'Turn on remote control on the machine.',
    );
    expect(laundryReadiness({ ...everything, power: true, remote_control: true }, true)).toBe(
      'The machine reports a fault: Draining problem.',
    );
    expect(laundryReadiness({ ...ready, door_state: 'Open' }, true)).toBe('Close the door.');
  });

  it('does not treat the child lock as a blocker', () => {
    expect(laundryReadiness({ ...ready, child_lock: true }, true)).toBeNull();
  });

  it('says why the door is shut', () => {
    expect(LAUNDRY_DOORS.map((door) => doorLine(door, 'idle'))).toEqual([
      'Door open',
      'Door unlocked',
      'Door locked',
      'Door locked · drying',
      'Door locked · water too hot',
      'Door locked · water in drum',
      'Door locked · drum spinning',
    ]);
    expect(doorLine('Closed And Can Not Be Opened', 'wash')).toBe('Door locked · cycle running');
    expect(doorLine('Closed And Can Not Be Opened', 'paused')).toBe('Door locked');
    expect(() => doorLine('Ajar', 'idle')).toThrow(/door_state/);
  });

  it('offers the door release only while paused with the door held by the cycle', () => {
    expect(doorReleaseAllowed('Closed And Can Not Be Opened', 'paused')).toBe(true);
    expect(doorReleaseAllowed('Closed And Can Not Be Opened', 'wash')).toBe(false);
    expect(doorReleaseAllowed('Unopenable And High Water Level', 'paused')).toBe(false);
  });

  it('gives advice for every fault the machine can report', () => {
    for (const option of optionsOf('raw:2.4')) {
      const advice = faultAdvice(option);
      expect(advice === null, option).toBe(option === 'No Faults');
    }
    expect(LAUNDRY_FAULTS.map((fault) => fault.raw).sort()).toEqual(
      optionsOf('raw:2.4')
        .filter((option) => option !== 'No Faults')
        .sort(),
    );
    expect(faultAdvice('Water Draining Malfunction')).toEqual({
      code: 3,
      title: 'Draining problem',
      advice: 'Check the drain filter and hose for a blockage.',
    });
    expect(faultAdvice('Dehydration Fault')?.advice).toBe(
      'The load is unbalanced. Spread the laundry and run Spin.',
    );
    expect(faultAdvice('Motor Fault (12)')).toMatchObject({ code: 12, title: 'Motor problem' });
    expect(faultAdvice('Water Weating Tube Malfunction')?.title).toBe('Water heater problem');
    expect(faultAdvice('Something new')).toMatchObject({ code: 0, title: 'Machine fault' });
  });

  it('reads the fault from the values', () => {
    expect(laundryFault({})).toBeNull();
    expect(laundryFault({ fault: 'No Faults' })).toBeNull();
    expect(laundryFault({ fault: 'Overflow Malfunction' })).toBe('Overflow Malfunction');
    expect(() => laundryFault({ fault: 3 })).toThrow(LaundryValueError);
  });
});

describe('starting a wash', () => {
  const idle: LaundryValues = {
    power: true,
    laundry_status: 'Idle',
    laundry_program: 'ECO4060',
    wash_temperature: '40',
    spin_speed: '1400',
    rinse_count: 2,
    dry_mode: 'None',
    delay_mode: 'None',
  };

  it('sends only the start when nothing differs', () => {
    expect(laundryStartPlan({ program: 'ECO4060', temperature: 40, spin: 1400 }, idle)).toEqual([
      { role: 'cycle_start', value: null },
    ]);
  });

  it('puts the steps in order: power, program, options, delay, start', () => {
    const plan = laundryStartPlan(
      {
        program: 'Wash Dry',
        temperature: 60,
        spin: 1000,
        rinses: 3,
        soakMinutes: 10,
        dryMode: 'Timed',
        dryMinutes: 60,
        steam: true,
        extraWater: true,
        quiet: true,
        antiCreaseMinutes: 30,
        delay: { mode: 'Finish Wash', minutes: 400 },
      },
      { ...idle, power: false, soak_minutes: 0, steam_hygiene: false },
    );
    expect(plan).toEqual([
      { role: 'power', value: true },
      { role: 'laundry_program', value: 'Wash Dry' },
      { role: 'wash_temperature', value: '60' },
      { role: 'spin_speed', value: '1000' },
      { role: 'rinse_count', value: 3 },
      { role: 'soak_minutes', value: 10 },
      { role: 'dry_mode', value: 'Timed' },
      { role: 'dry_minutes', value: 60 },
      { role: 'steam_hygiene', value: true },
      { role: 'extra_water', value: true },
      { role: 'quiet_mode', value: true },
      { role: 'anti_crease_minutes', value: 30 },
      { role: 'delay_mode', value: 'Finish Wash' },
      { role: 'delay_minutes', value: 400 },
      { role: 'cycle_start', value: null },
    ]);
  });

  it('sends the dryness target only for sensor drying and the time only for timed drying', () => {
    const sensor = laundryStartPlan(
      { program: 'Dry', dryMode: 'Smart', dryTarget: 'Store', dryMinutes: 30 },
      idle,
    );
    expect(sensor.map((step) => step.role)).toEqual([
      'laundry_program',
      'dry_mode',
      'dry_target',
      'cycle_start',
    ]);
    const kept = laundryStartPlan({ program: 'Dry', dryMinutes: 30, dryTarget: 'Store' }, idle);
    expect(kept.map((step) => step.role)).toEqual(['laundry_program', 'cycle_start']);
  });

  it('leaves out options the program does not use', () => {
    const plan = laundryStartPlan({ program: 'Spin', temperature: 90, spin: 800, rinses: 5 }, idle);
    expect(plan).toEqual([
      { role: 'laundry_program', value: 'Spin' },
      { role: 'spin_speed', value: '800' },
      { role: 'cycle_start', value: null },
    ]);
  });

  it('sends every option the program uses when the program changes, even ones that match the old values', () => {
    const plan = laundryStartPlan({ program: 'Cotton', temperature: 40, spin: 1400 }, idle);
    expect(plan).toEqual([
      { role: 'laundry_program', value: 'Cotton' },
      { role: 'wash_temperature', value: '40' },
      { role: 'spin_speed', value: '1400' },
      { role: 'cycle_start', value: null },
    ]);
  });

  it('refuses option values the machine cannot take', () => {
    const refused = (option: Record<string, unknown>): boolean =>
      !LAUNDRY_DRAFT.safeParse({ program: 'Cotton', ...option }).success;
    expect(refused({ temperature: 45 })).toBe(true);
    expect(refused({ spin: 1500 })).toBe(true);
    expect(refused({ soakMinutes: 15 })).toBe(true);
    expect(refused({ washMinutes: 121 })).toBe(true);
    expect(refused({ dryMinutes: 181 })).toBe(true);
    expect(refused({ antiCreaseMinutes: 1441 })).toBe(true);
    expect(refused({ temperature: 40, spin: 1400, soakMinutes: 20 })).toBe(false);
  });

  it('clears a delay only when asked to and only when one is set', () => {
    const delayed = { ...idle, delay_mode: 'Finish Wash', delay_minutes: 400 };
    expect(laundryStartPlan({ program: 'ECO4060', delay: null }, delayed)).toEqual([
      { role: 'delay_mode', value: 'None' },
      { role: 'cycle_start', value: null },
    ]);
    expect(laundryStartPlan({ program: 'ECO4060', delay: null }, idle)).toEqual([
      { role: 'cycle_start', value: null },
    ]);
    expect(
      laundryStartPlan(
        { program: 'ECO4060', delay: null },
        { power: true, laundry_program: 'ECO4060' },
      ),
    ).toEqual([{ role: 'cycle_start', value: null }]);
    expect(laundryStartPlan({ program: 'ECO4060' }, delayed)).toEqual([
      { role: 'cycle_start', value: null },
    ]);
    expect(
      laundryStartPlan(
        { program: 'ECO4060', delay: { mode: 'Finish Wash', minutes: 400 } },
        delayed,
      ),
    ).toEqual([{ role: 'cycle_start', value: null }]);
  });

  it('refuses a program the machine does not have and a delay beyond 48 hours', () => {
    expect(() => laundryStartPlan({ program: 'Rocket' }, idle)).toThrow(/unknown washer program/);
    expect(() =>
      laundryStartPlan({ program: 'ECO4060', delay: { mode: 'Start Wash', minutes: 2881 } }, idle),
    ).toThrow();
  });

  it('turns steps into commands through the capability keys', () => {
    const steps = laundryStartPlan({ program: 'Cotton' }, idle);
    const keys = new Map<string, CapabilityKey>([
      ['laundry_program', 'raw:2.3'],
      ['cycle_start', 'raw:action.2.2'],
    ]);
    expect(laundryCommands(steps, (role) => keys.get(role))).toEqual([
      { capability: 'raw:2.3', value: 'Cotton' },
      { capability: 'raw:action.2.2', value: null },
    ]);
    expect(() => laundryCommands(steps, () => undefined)).toThrow(LaundryRoleMissingError);
  });
});

describe('finish-by', () => {
  it('counts minutes across midnight', () => {
    expect(minutesUntil(22 * 60, 7 * 60)).toBe(9 * 60);
    expect(minutesUntil(8 * 60, 10 * 60)).toBe(120);
    expect(minutesUntil(600, 600)).toBe(1440);
  });

  it('warns when the finish time is sooner than the program takes', () => {
    expect(laundryDelayError({ mode: 'Finish Wash', minutes: 60 }, 93)).toBe(
      'Too soon: this program takes 1 h 33 min.',
    );
    expect(laundryDelayError({ mode: 'Finish Wash', minutes: 93 }, 93)).toBeNull();
    expect(laundryDelayError({ mode: 'Finish Wash', minutes: 10 }, null)).toBeNull();
    expect(laundryDelayError({ mode: 'Start Wash', minutes: 10 }, 93)).toBeNull();
  });

  it('writes durations in hours and minutes', () => {
    expect(formatLaundryMinutes(45)).toBe('45 min');
    expect(formatLaundryMinutes(120)).toBe('2 h');
    expect(formatLaundryMinutes(213)).toBe('3 h 33 min');
  });
});

describe('laundry values and events', () => {
  it('collects values by role from presented capabilities', () => {
    const reported: Readonly<Record<string, JsonValue>> = {
      'raw:2.2': 'Off',
      'raw:2.20': 708,
      'raw:2.4': 'No Faults',
      power: false,
      'raw:2.1': 'x',
    };
    const values = laundryValuesOf(
      [
        { key: 'raw:2.2', role: 'laundry_status' },
        { key: 'raw:2.20', role: 'laundry_phases' },
        { key: 'raw:2.4', role: 'fault' },
        { key: 'power', role: 'power' },
        { key: 'raw:2.1', role: 'mode' },
        { key: 'raw:1.1', role: null },
        { key: 'raw:2.10', role: 'remaining_minutes' },
      ],
      (key) => reported[key],
    );
    expect(values).toEqual({
      laundry_status: 'Off',
      laundry_phases: 708,
      fault: 'No Faults',
      power: false,
    });
    expect(isLaundryValueRole('mode')).toBe(false);
    expect(isLaundryValueRole(null)).toBe(false);
  });

  it('labels a finished laundry cycle as laundry done and others as a cycle', () => {
    expect(eventLabel('cycle_finished', { family: 'laundry' })).toBe('Laundry done');
    expect(eventLabel('cycle_finished', { family: 'laundry', outcome: 'stopped' })).toBe(
      'Laundry stopped',
    );
    expect(eventLabel('cycle_finished', {})).toBe('Cycle finished');
  });
});
