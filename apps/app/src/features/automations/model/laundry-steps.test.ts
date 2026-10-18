import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AUTOMATION_V2,
  JSON_VALUE,
  laundryCommands,
  laundryStartPlan,
  signalMatchesV2,
  type LaundryDraft,
  type SignalInput,
  type AutomationV2,
  type CapabilityKey,
  type DeviceCapability,
} from '@smarteverything/domain';
import type { DeviceLike } from './capability-choices';
import { describeStep } from './describe-steps';
import { describeTrigger, type Names } from './describe';
import { RUN_PROGRAM_LABEL } from './kind-labels';
import {
  defaultProgramDraft,
  laundryEntries,
  runProgramSteps,
  type LaundryEntry,
} from './laundry-steps';
import { storedAutomationOf } from './reusable-steps';
import { templatesFor } from './templates';
import { validateDraft, type ValidationChoices } from './validate';
import { capability, lamp } from './test-devices';

const WASHER_ID = '20000000-0000-4000-8000-000000000001';

const PROGRAMS = ['ECO4060', 'Cotton', 'Quick Wash', 'Drum Clean'];
const LEVELS = ['Low', 'Normal'];

const WASHER_CAPABILITIES: DeviceCapability[] = [
  capability('power', 'Power', 'read_write', { kind: 'boolean' }),
  capability('raw:2.2', 'Washer: Status', 'read', {
    kind: 'enum',
    options: ['Off', 'Idle', 'Busy', 'Completed'],
  }),
  capability('raw:2.4', 'Washer: Device Fault', 'read', {
    kind: 'enum',
    options: ['No Faults', 'Motor Fault'],
  }),
  capability('raw:2.3', 'Washer: Mode', 'read_write', { kind: 'enum', options: PROGRAMS }),
  capability('raw:2.5', 'Washer: Target Temperature', 'read_write', {
    kind: 'enum',
    options: ['20', '40', '60'],
  }),
  capability('raw:2.7', 'Washer: Spin Speed', 'read_write', {
    kind: 'enum',
    options: ['800', '1400'],
  }),
  capability('raw:action.2.2', 'Washer: Start Wash', 'write', { kind: 'action' }),
  capability('raw:2.9', 'Washer: Door State', 'read', {
    kind: 'enum',
    options: ['Open', 'Closed And Can Be Opened'],
  }),
  capability('raw:8.1', 'Detergent Left Level', 'read', { kind: 'enum', options: LEVELS }),
  capability('raw:9.1', 'Fabric Softener Left Level', 'read', { kind: 'enum', options: LEVELS }),
  capability('raw:2.42', 'Washer: Filter Need Cleaning', 'read', { kind: 'boolean' }),
];

const POWER_ONLY = WASHER_CAPABILITIES.filter((entry) => entry.key === 'power');

const washer: DeviceLike = {
  id: WASHER_ID,
  label: 'Washer',
  kind: 'appliance',
  model: 'mibx5.washer.f29gl',
  capabilities: WASHER_CAPABILITIES,
};

const NAMES: Names = { devices: [washer], scenes: [], people: [], chats: [] };

const CHOICES: ValidationChoices = {
  devices: [washer],
  sceneIds: [],
  profileIds: [],
  valueIds: [],
  groupIds: [],
  roomIds: [],
  automationIds: [],
  callable: [],
  inputs: [],
};

const KEY_OF_ROLE: Readonly<Partial<Record<string, CapabilityKey>>> = {
  laundry_program: 'raw:2.3',
  wash_temperature: 'raw:2.5',
  spin_speed: 'raw:2.7',
  cycle_start: 'raw:action.2.2',
};

const bareWasher: DeviceLike = {
  id: '20000000-0000-4000-8000-000000000002',
  label: 'Old washer',
  kind: 'appliance',
  model: 'acme.washer.x1',
  capabilities: POWER_ONLY,
};
const PROGRAM_ROLES = ['laundry_program', 'cycle_start'] as const;

describe('laundry devices', () => {
  it('are recognised by their presentation and have to own the roles asked for', () => {
    expect(laundryEntries([lamp, washer], []).map((entry) => entry.device)).toEqual([washer]);
    expect(laundryEntries([lamp, washer, bareWasher], []).map((entry) => entry.device)).toEqual([
      washer,
      bareWasher,
    ]);
    expect(
      laundryEntries([washer, bareWasher], PROGRAM_ROLES).map((entry) => entry.device),
    ).toEqual([washer]);
  });
});

describe('Run a program', () => {
  const draft: LaundryDraft = { program: 'Cotton', temperature: 40, spin: 1400 };
  const entry = (device: DeviceLike): LaundryEntry => {
    const [found] = laundryEntries([device], []);
    if (found === undefined) throw new Error('Not a laundry device.');
    return found;
  };

  it('expands to the ordered start plan of the washer', () => {
    const steps = runProgramSteps(entry(washer), draft);
    const commands = laundryCommands(laundryStartPlan(draft, {}), (role) => KEY_OF_ROLE[role]);
    expect(steps.map((step) => [step.control, step.to])).toEqual(
      commands.map((command) => [command.capability, command.value]),
    );
    expect(steps.map((step) => step.control)).toEqual([
      'raw:2.3',
      'raw:2.5',
      'raw:2.7',
      'raw:action.2.2',
    ]);
    expect(steps.every((step) => 'device' in step.target && step.target.device === WASHER_ID)).toBe(
      true,
    );
  });

  it('starts with the default program and ends with the start action', () => {
    const steps = runProgramSteps(entry(washer), defaultProgramDraft());
    expect(steps.map((step) => [step.control, step.to])).toEqual([
      ['raw:2.3', 'ECO4060'],
      ['raw:action.2.2', null],
    ]);
  });

  it('refuses a machine that cannot start a program', () => {
    expect(() => runProgramSteps(entry(bareWasher), draft)).toThrow('The washer has no capability');
  });

  it('survives the stored definition round trip and validates against the devices', () => {
    const when = [{ on: 'time' as const, at: '07:00' }];
    const automation: AutomationV2 = { when, steps: runProgramSteps(entry(washer), draft) };
    const stored = JSON.stringify(automation);
    expect(AUTOMATION_V2.parse(JSON.parse(stored))).toEqual(automation);
    const definition = z.record(z.string(), JSON_VALUE).parse(JSON.parse(stored));
    expect(storedAutomationOf({ definition })).toEqual(automation);
    expect(
      validateDraft({ name: 'Wash', enabled: true, automation }, CHOICES, { reusable: false }),
    ).toMatchObject({ valid: true });
  });

  it('reads as ordinary control steps in the editor', () => {
    const [program] = runProgramSteps(entry(washer), defaultProgramDraft());
    expect(RUN_PROGRAM_LABEL).toBe('Run a program');
    expect(program === undefined ? '' : describeStep(NAMES, program)).toContain('Washer');
  });
});

describe('laundry templates', () => {
  const templates = templatesFor([washer]);

  it('are offered only for the washer with the roles it has', () => {
    expect(templates.map((template) => template.id)).toEqual([
      `laundry-done:${WASHER_ID}`,
      `laundry-fault:${WASHER_ID}`,
      `laundry-detergent_level:${WASHER_ID}`,
      `laundry-softener_level:${WASHER_ID}`,
      `laundry-filter_clean:${WASHER_ID}`,
    ]);
    expect(templatesFor([bareWasher]).filter((t) => t.id.startsWith('laundry'))).toEqual([]);
    expect(templatesFor([lamp, washer]).map((template) => template.id)).toContain('sunset-lights');
    expect(templatesFor([lamp]).filter((template) => template.id.startsWith('laundry'))).toEqual(
      [],
    );
  });

  it('notify with their own text and validate against the devices', () => {
    for (const template of templates) {
      expect(validateDraft(template.draft, CHOICES, { reusable: false }).valid).toBe(true);
    }
    expect(templates.map((template) => template.draft.automation.steps)).toEqual([
      [{ do: 'notify', message: 'Washer has finished its cycle.' }],
      [{ do: 'notify', message: 'Washer reported a fault. Open it to see what to try.' }],
      [{ do: 'notify', message: 'Washer is low on detergent.' }],
      [{ do: 'notify', message: 'Washer is low on softener.' }],
      [{ do: 'notify', message: 'Washer needs its filter cleaned.' }],
    ]);
  });

  it('trigger on the laundry events and levels', () => {
    expect(templates.map((template) => template.draft.automation.when)).toEqual([
      [
        {
          on: 'signal',
          source: 'event',
          kind: 'cycle_finished',
          subject: WASHER_ID,
          match: { outcome: 'completed' },
        },
      ],
      [{ on: 'signal', source: 'event', kind: 'fault', subject: WASHER_ID }],
      [
        {
          on: 'signal',
          source: 'device',
          kind: 'state',
          subject: WASHER_ID,
          field: 'raw:8.1',
          test: { is: 'eq', to: 'Low' },
        },
      ],
      [
        {
          on: 'signal',
          source: 'device',
          kind: 'state',
          subject: WASHER_ID,
          field: 'raw:9.1',
          test: { is: 'eq', to: 'Low' },
        },
      ],
      [
        {
          on: 'signal',
          source: 'device',
          kind: 'state',
          subject: WASHER_ID,
          field: 'raw:2.42',
          test: { is: 'eq', to: true },
        },
      ],
    ]);
  });

  it('fire for completed cycles only', () => {
    const trigger = templates[0]?.draft.automation.when[0];
    if (trigger?.on !== 'signal') throw new Error('The done template needs a signal trigger.');
    const finished = (outcome: string): SignalInput => ({
      source: 'event',
      kind: 'cycle_finished',
      subject: WASHER_ID,
      field: null,
      value: null,
      previous: null,
      at: '2026-10-17T10:00:00.000Z',
      profileId: null,
      data: { family: 'laundry', outcome },
    });
    expect(signalMatchesV2(trigger, finished('completed'))).toBe(true);
    expect(signalMatchesV2(trigger, finished('stopped'))).toBe(false);
  });

  it('offer Run a program only on washers that own the program and start roles', () => {
    expect(laundryEntries([washer, bareWasher], PROGRAM_ROLES)).toHaveLength(1);
    expect(
      laundryEntries(
        [washer, { ...washer, id: '20000000-0000-4000-8000-000000000003' }],
        PROGRAM_ROLES,
      ),
    ).toHaveLength(2);
  });

  it('label the cycle event as laundry done for a washer', () => {
    const finished = templates[0]?.draft.automation.when[0];
    expect(finished === undefined ? '' : describeTrigger(NAMES, finished)).toBe(
      'Washer reports “Laundry done”',
    );
  });
});
