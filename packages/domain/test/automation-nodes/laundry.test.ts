import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { LAUNDRY_PHASES, LAUNDRY_STATUSES } from '../../src/laundry';
import { LAUNDRY_DRAFT } from '../../src/laundry-plan';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import type { InputPortDecl } from '../../src/automation-nodes/define';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, execPortsOf, fallibleOf } from '../../src/automation-nodes/exec-ports';
import {
  LAUNDRY_CONTROL_CHOICES,
  LAUNDRY_DELAY_MAX_MINUTES,
  LAUNDRY_DELAY_MODE_CHOICES,
  LAUNDRY_KINDS,
  LAUNDRY_SPIN_CHOICES,
  LAUNDRY_TEMPERATURE_CHOICES,
} from '../../src/automation-nodes/laundry';
import { isOptionSourceId } from '../../src/automation-nodes/option-sources';
import { kindProblems } from '../../src/automation-nodes/registry';
import { hasModeChoice, modesOf, runModeOf } from '../../src/automation-nodes/run-modes';
import { renderSummary, summaryText } from '../../src/automation-nodes/summary-template';

const IDS = ['laundry.start', 'laundry.control', 'laundry.read'] as const;

type LaundryId = (typeof IDS)[number];

function kindOf(id: LaundryId): (typeof LAUNDRY_KINDS)[number] | undefined {
  return NODE_REGISTRY.get(id);
}

function input(id: LaundryId, name: string): InputPortDecl | undefined {
  return kindOf(id)?.inputs.find((port) => port.name === name);
}

function output(id: LaundryId, name: string): unknown {
  return kindOf(id)?.outputs.find((port) => port.name === name);
}

const EFFECT_IDS = ['laundry.start', 'laundry.control'] as const;

describe('laundry kinds registration', () => {
  it('registers exactly the three kinds once each as valid device nodes', () => {
    expect(LAUNDRY_KINDS.map((each) => each.id)).toEqual([...IDS]);
    for (const id of IDS) {
      expect(
        ALL_NODE_KINDS.filter((each) => each.id === id),
        id,
      ).toHaveLength(1);
      expect(kindOf(id)?.category, id).toBe('devices');
      const kind = kindOf(id);
      expect(kind === undefined ? ['missing'] : kindProblems(kind), id).toEqual([]);
    }
    expect(kindOf('laundry.start')?.class).toBe('effect');
    expect(kindOf('laundry.control')?.class).toBe('effect');
    expect(kindOf('laundry.read')?.class).toBe('read');
  });

  it('takes a washing machine or dryer as the machine of every kind', () => {
    for (const id of IDS)
      expect(input(id, 'machine'), id).toMatchObject({
        type: { t: 'ref', of: 'device', families: ['laundry'] },
        required: true,
        summary: true,
      });
  });
});

describe('laundry.start ports are typed with pickers', () => {
  it('picks the program from the laundry programs and requires it', () => {
    expect(input('laundry.start', 'program')).toMatchObject({
      type: { t: 'text' },
      required: true,
      static: true,
      ui: { optionsFrom: 'laundry.programs' },
    });
  });

  it('offers temperature, spin and the delay mode as choices the machine accepts', () => {
    for (const choice of LAUNDRY_TEMPERATURE_CHOICES)
      expect(
        LAUNDRY_DRAFT.safeParse({ program: 'Cotton', temperature: Number(choice.id) }).success,
        choice.id,
      ).toBe(true);
    for (const choice of LAUNDRY_SPIN_CHOICES)
      expect(
        LAUNDRY_DRAFT.safeParse({ program: 'Cotton', spin: Number(choice.id) }).success,
        choice.id,
      ).toBe(true);
    for (const choice of LAUNDRY_DELAY_MODE_CHOICES)
      expect(
        LAUNDRY_DRAFT.safeParse({ program: 'Cotton', delay: { mode: choice.id, minutes: 5 } })
          .success,
        choice.id,
      ).toBe(true);
    expect(input('laundry.start', 'temperature')?.type).toEqual({
      t: 'choice',
      options: [...LAUNDRY_TEMPERATURE_CHOICES],
    });
    expect(input('laundry.start', 'spin')?.type).toEqual({
      t: 'choice',
      options: [...LAUNDRY_SPIN_CHOICES],
    });
    expect(input('laundry.start', 'delayMode')).toMatchObject({
      type: { t: 'choice', options: [...LAUNDRY_DELAY_MODE_CHOICES] },
      default: 'Start Wash',
    });
  });

  it('types the delay as a duration whose range is the machine range', () => {
    const delay = input('laundry.start', 'delay');
    expect(delay).toMatchObject({
      type: { t: 'duration' },
      required: false,
      live: true,
      ui: { unit: 'ms', min: 60_000, max: LAUNDRY_DELAY_MAX_MINUTES * 60_000 },
    });
    const draft = (minutes: number): boolean =>
      LAUNDRY_DRAFT.safeParse({ program: 'Cotton', delay: { mode: 'Start Wash', minutes } })
        .success;
    expect(draft(LAUNDRY_DELAY_MAX_MINUTES)).toBe(true);
    expect(draft(LAUNDRY_DELAY_MAX_MINUTES + 1)).toBe(false);
    expect(draft(1)).toBe(true);
    expect(draft(0)).toBe(false);
  });

  it('lists the options a program left out and the success flag', () => {
    expect(output('laundry.start', 'ok')).toMatchObject({ type: { t: 'boolean' } });
    expect(output('laundry.start', 'ignored')).toMatchObject({
      type: { t: 'list', of: { t: 'text' } },
    });
  });

  it('summarises in plain words and shows unset values as absent', () => {
    expect(
      summaryText(
        renderSummary(kindOf('laundry.start')?.summary ?? '', { program: { lit: 'Cotton' } }),
      ),
    ).toBe('Start Cotton on …');
  });
});

describe('laundry.control ports are typed', () => {
  it('offers pause and stop as the action', () => {
    expect(LAUNDRY_CONTROL_CHOICES.map((choice) => choice.id)).toEqual(['pause', 'stop']);
    expect(input('laundry.control', 'action')).toMatchObject({
      type: { t: 'choice', options: [...LAUNDRY_CONTROL_CHOICES] },
      required: true,
      static: true,
      summary: true,
    });
  });
});

describe('laundry.read outputs', () => {
  it('reports status, phase, remaining duration and door as typed optional values', () => {
    expect(output('laundry.read', 'remaining')).toMatchObject({
      type: { t: 'duration' },
      optional: true,
    });
    expect(output('laundry.read', 'doorOpen')).toMatchObject({
      type: { t: 'boolean' },
      optional: true,
    });
    const status = kindOf('laundry.read')?.outputs.find((port) => port.name === 'status');
    const phase = kindOf('laundry.read')?.outputs.find((port) => port.name === 'phase');
    expect(status?.optional).toBe(true);
    expect(phase?.optional).toBe(true);
    expect(status?.type.t === 'choice' ? status.type.options.map((each) => each.id) : []).toEqual([
      ...LAUNDRY_STATUSES,
    ]);
    expect(phase?.type.t === 'choice' ? phase.type.options.map((each) => each.id) : []).toEqual([
      ...LAUNDRY_PHASES,
    ]);
  });

  it('gives every status and phase a plain label', () => {
    for (const name of ['status', 'phase']) {
      const port = kindOf('laundry.read')?.outputs.find((each) => each.name === name);
      const options = port?.type.t === 'choice' ? port.type.options : [];
      expect(options.length, name).toBeGreaterThan(0);
      for (const option of options) expect(option.label, option.id).not.toBe('');
    }
  });

  it('is a pure read of the device state', () => {
    expect(kindOf('laundry.read')?.exits).toEqual([]);
    expect(kindOf('laundry.read')?.reads?.({})).toEqual(['device']);
    expect(kindOf('laundry.read')?.effect).toBeUndefined();
  });
});

describe('laundry ports have no raw JSON and only known picker sources', () => {
  it('uses no any or record input and declares each source in the closed list', () => {
    for (const id of IDS)
      for (const port of kindOf(id)?.inputs ?? []) {
        expect(['any', 'record'], `${id} ${port.name}`).not.toContain(port.type.t);
        expect(port.required && port.default !== undefined, `${id} ${port.name}`).toBe(false);
        if (port.ui?.optionsFrom !== undefined)
          expect(isOptionSourceId(port.ui.optionsFrom), `${id} ${port.name}`).toBe(true);
      }
  });
});

describe('laundry effects run mode and error exit', () => {
  it('send by default and may wait for the machine to confirm', () => {
    for (const id of EFFECT_IDS) {
      const kind = kindOf(id);
      expect(kind?.effect, id).toEqual({
        retry: 'idempotent',
        budget: 'command',
        mode: 'fire_and_forget',
      });
      expect(modesOf(kind), id).toEqual({
        default: 'fire_and_forget',
        allowed: ['fire_and_forget', 'wait_for_result'],
      });
      expect(hasModeChoice(kind), id).toBe(true);
      expect(runModeOf(kind, undefined), id).toBe('fire_and_forget');
      expect(runModeOf(kind, 'wait_for_result'), id).toBe('wait_for_result');
    }
  });

  it('are fallible, carry the shared error output and can route their failure', () => {
    for (const id of EFFECT_IDS) {
      expect(fallibleOf(id, STATIC_KIND_LOOKUP), id).toBe(true);
      expect(canRouteOnError(id, STATIC_KIND_LOOKUP), id).toBe(true);
      expect(kindOf(id)?.outputs.at(-1), id).toBe(ERROR_OUT);
      const wired = execPortsOf(
        id,
        {
          id: '00000000-0000-4000-8000-000000000001',
          key: 'laundry',
          kind: id,
          to: { onError: '00000000-0000-4000-8000-000000000002' },
        },
        STATIC_KIND_LOOKUP,
      );
      expect(
        wired.outputs.map((out) => out.port),
        id,
      ).toContain('onError');
      expect(
        execPortsOf(id, undefined, STATIC_KIND_LOOKUP).outputs.map((out) => out.port),
        id,
      ).not.toContain('onError');
    }
  });

  it('does not give the read an error exit', () => {
    expect(fallibleOf('laundry.read', STATIC_KIND_LOOKUP)).toBe(false);
  });
});
