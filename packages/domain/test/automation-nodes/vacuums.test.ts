import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import type { InputPortDecl } from '../../src/automation-nodes/define';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, execPortsOf, fallibleOf } from '../../src/automation-nodes/exec-ports';
import { isOptionSourceId } from '../../src/automation-nodes/option-sources';
import { kindProblems } from '../../src/automation-nodes/registry';
import { hasModeChoice, modesOf, runModeOf } from '../../src/automation-nodes/run-modes';
import { renderSummary, summaryText } from '../../src/automation-nodes/summary-template';
import {
  VACUUM_CLEAN_MODE_CHOICES,
  VACUUM_COMMAND_CHOICES,
  VACUUM_KINDS,
  VACUUM_PASSES_MAX,
  VACUUM_STATION_CHOICES,
  VACUUM_SUCTION_CHOICES,
  VACUUM_WATER_CHOICES,
} from '../../src/automation-nodes/vacuums';
import { VACUUM_CLEAN_ACTION_ROLES, VACUUM_STATION_ACTION_ROLES } from '../../src/vacuum-roles';

const IDS = ['vacuum.command', 'vacuum.station', 'vacuum.clean_rooms'] as const;

function kindOf(id: (typeof IDS)[number]): (typeof VACUUM_KINDS)[number] | undefined {
  return NODE_REGISTRY.get(id);
}

function input(id: (typeof IDS)[number], name: string): InputPortDecl | undefined {
  return kindOf(id)?.inputs.find((port) => port.name === name);
}

describe('vacuum kinds registration', () => {
  it('registers the three effects, the status read and the vacuum trigger once each', () => {
    expect(VACUUM_KINDS.map((each) => each.id)).toEqual([...IDS, 'vacuum.read', 'trigger.vacuum']);
    for (const id of IDS) {
      const kind = kindOf(id);
      expect(
        ALL_NODE_KINDS.filter((each) => each.id === id),
        id,
      ).toHaveLength(1);
      expect(kind?.class, id).toBe('effect');
      expect(kind?.category, id).toBe('devices');
      expect(kind === undefined ? ['missing'] : kindProblems(kind), id).toEqual([]);
    }
  });

  it('declares the ports the objective names', () => {
    expect(kindOf('vacuum.command')?.inputs.map((port) => port.name)).toEqual(['vacuum', 'action']);
    expect(kindOf('vacuum.station')?.inputs.map((port) => port.name)).toEqual(['vacuum', 'action']);
    expect(kindOf('vacuum.clean_rooms')?.inputs.map((port) => port.name)).toEqual([
      'vacuum',
      'rooms',
      'mode',
      'suction',
      'water',
      'passes',
    ]);
    expect(kindOf('vacuum.clean_rooms')?.outputs.map((port) => port.name)).toEqual([
      'started',
      'rooms',
      'unlinkedRooms',
      'error',
    ]);
  });
});

describe('vacuum choices', () => {
  it('offers the command choices the objective names', () => {
    expect(VACUUM_COMMAND_CHOICES.map((choice) => choice.id)).toEqual([
      'start',
      'pause',
      'resume',
      'stop',
      'dock',
      'spot',
    ]);
  });

  it('offers every station job role except the one whose meaning is unconfirmed', () => {
    const roles = VACUUM_STATION_CHOICES.map((choice) => `vacuum_${choice.id}`);
    expect(roles.toSorted()).toEqual(
      VACUUM_STATION_ACTION_ROLES.filter((role) => role !== 'vacuum_dust_set').toSorted(),
    );
  });

  it('sends the spot clean through a known cleaning role', () => {
    expect(VACUUM_CLEAN_ACTION_ROLES).toContain('vacuum_spot_clean');
  });

  it('labels every choice in plain words and never repeats an id', () => {
    for (const choices of [
      VACUUM_COMMAND_CHOICES,
      VACUUM_STATION_CHOICES,
      VACUUM_CLEAN_MODE_CHOICES,
      VACUUM_SUCTION_CHOICES,
      VACUUM_WATER_CHOICES,
    ]) {
      expect(new Set(choices.map((choice) => choice.id)).size).toBe(choices.length);
      for (const choice of choices) expect(choice.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('vacuum ports are typed with pickers', () => {
  it('takes a required vacuum device on every kind', () => {
    for (const id of IDS)
      expect(input(id, 'vacuum'), id).toMatchObject({
        type: { t: 'ref', of: 'device', families: ['vacuum'] },
        required: true,
        summary: true,
      });
  });

  it('picks the action from closed choices', () => {
    expect(input('vacuum.command', 'action')).toMatchObject({
      type: { t: 'choice', options: [...VACUUM_COMMAND_CHOICES] },
      required: true,
      static: true,
    });
    expect(input('vacuum.station', 'action')).toMatchObject({
      type: { t: 'choice', options: [...VACUUM_STATION_CHOICES] },
      required: true,
      static: true,
    });
  });

  it('picks home rooms from the vacuum room picker as a list of room refs', () => {
    expect(input('vacuum.clean_rooms', 'rooms')).toMatchObject({
      type: { t: 'list', of: { t: 'ref', of: 'room' } },
      required: true,
      ui: { optionsFrom: 'vacuum.rooms', multiple: true },
    });
    expect(
      kindOf('vacuum.clean_rooms')?.outputs.find((out) => out.name === 'unlinkedRooms'),
    ).toMatchObject({
      type: { t: 'list', of: { t: 'ref', of: 'room' } },
    });
  });

  it('keeps cleaning mode, suction and mop water optional so the robot keeps its own', () => {
    for (const name of ['mode', 'suction', 'water', 'passes']) {
      const port = input('vacuum.clean_rooms', name);
      expect(port?.required, name).toBe(false);
      expect(port?.default, name).toBeUndefined();
    }
    expect(input('vacuum.clean_rooms', 'mode')?.type).toEqual({
      t: 'choice',
      options: [...VACUUM_CLEAN_MODE_CHOICES],
    });
    expect(input('vacuum.clean_rooms', 'suction')?.type).toEqual({
      t: 'choice',
      options: [...VACUUM_SUCTION_CHOICES],
    });
    expect(input('vacuum.clean_rooms', 'water')?.type).toEqual({
      t: 'choice',
      options: [...VACUUM_WATER_CHOICES],
    });
  });

  it('declares the passes range of the robot on the port and its editor', () => {
    expect(input('vacuum.clean_rooms', 'passes')).toMatchObject({
      type: { t: 'number', integer: true, min: 1, max: VACUUM_PASSES_MAX },
      ui: { min: 1, max: VACUUM_PASSES_MAX, step: 1 },
    });
  });

  it('has no free text, any or record input and only known picker sources', () => {
    for (const id of IDS)
      for (const port of kindOf(id)?.inputs ?? []) {
        expect(['text', 'any', 'record'], `${id}.${port.name}`).not.toContain(port.type.t);
        if (port.ui?.optionsFrom !== undefined)
          expect(isOptionSourceId(port.ui.optionsFrom), `${id}.${port.name}`).toBe(true);
        expect(port.required && port.default !== undefined, `${id}.${port.name}`).toBe(false);
      }
  });

  it('summarises in plain words and shows unset values as absent', () => {
    expect(
      summaryText(
        renderSummary(kindOf('vacuum.command')?.summary ?? '', { action: { lit: 'dock' } }),
      ),
    ).toBe('Tell … to dock');
    expect(summaryText(renderSummary(kindOf('vacuum.clean_rooms')?.summary ?? '', {}))).toBe(
      'Clean … with …',
    );
  });
});

describe('vacuum run mode and error exit', () => {
  it('sends by default and may wait for the robot to confirm', () => {
    for (const id of IDS) {
      const kind = kindOf(id);
      expect(kind?.effect?.mode, id).toBe('fire_and_forget');
      expect(modesOf(kind), id).toEqual({
        default: 'fire_and_forget',
        allowed: ['fire_and_forget', 'wait_for_result'],
      });
      expect(hasModeChoice(kind), id).toBe(true);
      expect(runModeOf(kind, undefined), id).toBe('fire_and_forget');
      expect(runModeOf(kind, 'wait_for_result'), id).toBe('wait_for_result');
    }
  });

  it('is fallible, carries the shared error output and can route its failure', () => {
    for (const id of IDS) {
      expect(fallibleOf(id, STATIC_KIND_LOOKUP), id).toBe(true);
      expect(canRouteOnError(id, STATIC_KIND_LOOKUP), id).toBe(true);
      expect(kindOf(id)?.outputs.at(-1), id).toBe(ERROR_OUT);
      const wired = execPortsOf(
        id,
        {
          id: '00000000-0000-4000-8000-000000000001',
          key: 'vacuum',
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
});
