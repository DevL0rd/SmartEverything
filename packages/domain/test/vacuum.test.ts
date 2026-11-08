import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CAPABILITY_CATALOGUE,
  EXTRA_ROLES,
  VACUUM_CLEANING_COMMANDS,
  VACUUM_CLEANING_OPTIONS,
  VACUUM_CHARGING_STATES,
  VACUUM_CLEANING_READINGS,
  VACUUM_CLEANING_RESULTS,
  VACUUM_MODES,
  VACUUM_PHASES,
  VACUUM_ROLES,
  VACUUM_ROOM_LINKS_SUMMARY,
  VACUUM_SCOPES,
  VACUUM_STATUS_TABLE,
  VACUUM_SWEEP_MOP_STATES,
  VACUUM_TASK_PHASES,
  VacuumValueError,
  isVacuumAwake,
  isVacuumCleaningCommand,
  isVacuumCleaningResult,
  isVacuumTaskPhase,
  isVacuumValueRole,
  vacuumChargingState,
  vacuumCleaningReading,
  vacuumFaultCodes,
  vacuumJob,
  vacuumMode,
  vacuumPhase,
  vacuumScope,
  vacuumStation,
  vacuumSweepMopState,
  vacuumValuesOf,
  type CapabilityKey,
  type VacuumPhase,
  type VacuumValues,
} from '../src';

const CATALOG = z.object({
  properties: z.array(
    z.object({
      siid: z.number(),
      piid: z.number(),
      values: z.array(z.object({ value: z.number(), spec: z.string() })),
      capability: z
        .object({ valueMap: z.array(z.object({ value: z.number(), state: z.string() })) })
        .nullable(),
    }),
  ),
});

const catalog = CATALOG.parse(
  JSON.parse(
    readFileSync(new URL('../../xiaomi/src/vacuum/pv11gl-catalog.json', import.meta.url), 'utf8'),
  ),
);

type Property = z.infer<typeof CATALOG>['properties'][number];

function property(siid: number, piid: number): Property {
  const found = catalog.properties.find((row) => row.siid === siid && row.piid === piid);
  if (found === undefined) throw new Error(`catalog has no ${String(siid)}.${String(piid)}`);
  return found;
}

const STATUS = property(2, 2);

function stateOf(status: number): string | undefined {
  return STATUS.capability?.valueMap.find((row) => row.value === status)?.state;
}

describe('the status table', () => {
  it('covers exactly the statuses of the robot spec, with the same names', () => {
    expect(VACUUM_STATUS_TABLE.map(({ value, spec }) => ({ value, spec }))).toStrictEqual(
      STATUS.values.map(({ value, spec }) => ({ value, spec })),
    );
    expect(VACUUM_STATUS_TABLE).toHaveLength(25);
  });

  it('gives every status a phase, by number and by spec name', () => {
    for (const entry of VACUUM_STATUS_TABLE) {
      expect(vacuumPhase({ vacuum_status: entry.value })).toBe(entry.phase);
      expect(vacuumPhase({ vacuum_status: entry.spec })).toBe(entry.phase);
    }
  });

  it('uses every phase at least once', () => {
    const used = new Set(VACUUM_STATUS_TABLE.map((entry) => entry.phase));
    expect([...VACUUM_PHASES].filter((phase) => !used.has(phase))).toStrictEqual([]);
  });

  it('has no phase for a status it does not know or a missing status', () => {
    expect(vacuumPhase({ vacuum_status: 22 })).toBeNull();
    expect(vacuumPhase({ vacuum_status: 'Teleporting' })).toBeNull();
    expect(vacuumPhase({})).toBeNull();
  });
});

describe('the cleaning capability', () => {
  it('reads the coarse phase the catalog already declares for every status', () => {
    for (const entry of VACUUM_STATUS_TABLE) {
      expect(vacuumCleaningReading(entry.phase)).toBe(stateOf(entry.value));
    }
  });

  it('offers the readings and the five commands, and only the commands are writable', () => {
    expect([...VACUUM_CLEANING_READINGS].sort()).toStrictEqual(
      [...new Set(STATUS.capability?.valueMap.map((row) => row.state))].sort(),
    );
    expect(VACUUM_CLEANING_COMMANDS).toStrictEqual(['start', 'pause', 'resume', 'dock', 'stop']);
    expect(VACUUM_CLEANING_OPTIONS).toHaveLength(
      VACUUM_CLEANING_READINGS.length + VACUUM_CLEANING_COMMANDS.length,
    );
    expect(new Set(VACUUM_CLEANING_OPTIONS).size).toBe(VACUUM_CLEANING_OPTIONS.length);
    expect(VACUUM_CLEANING_OPTIONS.filter(isVacuumCleaningCommand)).toStrictEqual([
      ...VACUUM_CLEANING_COMMANDS,
    ]);
    expect(CAPABILITY_CATALOGUE.cleaning.kind).toBe('enum');
  });
});

describe('what a cleaning command leads to', () => {
  it('names only readings as the results of every command', () => {
    expect(Object.keys(VACUUM_CLEANING_RESULTS)).toStrictEqual([...VACUUM_CLEANING_COMMANDS]);
    for (const results of Object.values(VACUUM_CLEANING_RESULTS)) {
      expect(results.every((result) => VACUUM_CLEANING_READINGS.includes(result))).toBe(true);
    }
  });

  it('accepts the reading a command causes and refuses one it does not', () => {
    expect(isVacuumCleaningResult('resume', 'cleaning')).toBe(true);
    expect(isVacuumCleaningResult('dock', 'returning')).toBe(true);
    expect(isVacuumCleaningResult('start', 'servicing')).toBe(true);
    expect(isVacuumCleaningResult('pause', 'cleaning')).toBe(false);
    expect(isVacuumCleaningResult('cleaning', 'cleaning')).toBe(false);
  });
});

describe('the station phase of a starting job', () => {
  it('reads the multi-task station status as station work inside a task, not an error', () => {
    for (const status of [12, 'MultiTaskStationWorking']) {
      const phase = vacuumPhase({ vacuum_status: status });
      expect(phase).toBe('station_busy');
      expect(isVacuumTaskPhase(phase)).toBe(true);
    }
    expect(vacuumCleaningReading('station_busy')).toBe('servicing');
  });
});

describe('the one awake rule', () => {
  const taskPhases = new Set<VacuumPhase>(VACUUM_TASK_PHASES);

  it('is awake when the robot reports it is not asleep, in any phase', () => {
    for (const entry of VACUUM_STATUS_TABLE) {
      expect(isVacuumAwake({ vacuum_status: entry.value, vacuum_asleep: false })).toBe(true);
    }
    expect(isVacuumAwake({ vacuum_status: 9, vacuum_asleep: false })).toBe(true);
  });

  it('is awake while a task runs even when the robot reports sleep', () => {
    for (const entry of VACUUM_STATUS_TABLE) {
      expect(isVacuumAwake({ vacuum_status: entry.value, vacuum_asleep: true })).toBe(
        taskPhases.has(entry.phase),
      );
    }
  });

  it('is asleep when docked, idle or broken and reported asleep or unknown', () => {
    expect(isVacuumAwake({ vacuum_status: 9, vacuum_asleep: true })).toBe(false);
    expect(isVacuumAwake({ vacuum_status: 2 })).toBe(false);
    expect(isVacuumAwake({})).toBe(false);
  });

  it('counts the ten task phases of the plan and no other', () => {
    expect([...VACUUM_TASK_PHASES].sort()).toStrictEqual(
      [
        'cleaning',
        'mopping',
        'paused',
        'returning',
        'washing_mop',
        'station_busy',
        'mapping',
        'mapping_paused',
        'remote',
        'summoned',
      ].sort(),
    );
  });
});

describe('the readings of the facts around the status', () => {
  it('names the scope, mode, charging and sweep-mop values', () => {
    const values: VacuumValues = {
      vacuum_scope: 3,
      vacuum_mode: 4,
      charging_state: 2,
      vacuum_sweep_mop_status: 2,
    };
    expect(vacuumScope(values)).toBe('rooms');
    expect(vacuumMode(values)).toBe('sweep_then_mop');
    expect(vacuumChargingState(values)).toBe('not_charging');
    expect(vacuumSweepMopState(values)).toBe('mopping');
    expect(vacuumScope({ vacuum_scope: 99 })).toBeNull();
    expect(vacuumScope({ vacuum_scope: 'Area' })).toBe('rooms');
    expect(vacuumMode({ vacuum_mode: 'Sweep Mop' })).toBe('sweep_mop');
    expect(vacuumChargingState({ charging_state: 'Not Charging' })).toBe('not_charging');
    expect(vacuumSweepMopState({ vacuum_sweep_mop_status: 'Mopping' })).toBe('mopping');
    expect(vacuumSweepMopState({ vacuum_sweep_mop_status: 'Drifting' })).toBeNull();
    expect(vacuumScope({})).toBeNull();
  });

  it('knows each value by the number and by the spec name the hub stores', () => {
    const tables = [
      [property(2, 5), VACUUM_SCOPES],
      [property(2, 4), VACUUM_MODES],
      [property(3, 2), VACUUM_CHARGING_STATES],
      [property(2, 96), VACUUM_SWEEP_MOP_STATES],
    ] as const;
    for (const [spec, rows] of tables) {
      for (const row of rows) {
        expect(spec.values.find((value) => value.value === row.value)?.spec).toBe(row.spec);
      }
    }
  });

  it('reads the station status and keeps a mode it has no name for', () => {
    expect(vacuumStation({})).toBeNull();
    expect(
      vacuumStation({ vacuum_station_mode: '{"mode":3,"progress":40,"extra":1}' }),
    ).toStrictEqual({
      mode: 'wash_mop',
      rawMode: 3,
      progress: 40,
    });
    expect(vacuumStation({ vacuum_station_mode: '{"mode":9}' })).toStrictEqual({
      mode: null,
      rawMode: 9,
      progress: null,
    });
    expect(() => vacuumStation({ vacuum_station_mode: 'nope' })).toThrow(VacuumValueError);
    expect(() => vacuumStation({ vacuum_station_mode: '{"progress":1}' })).toThrow(
      VacuumValueError,
    );
  });

  it('reads the live fault list, dropping the no-fault code and unknown fields', () => {
    expect(vacuumFaultCodes({})).toStrictEqual([]);
    expect(vacuumFaultCodes({ vacuum_fault_ids: '{"ts":1692831852,"fault":[]}' })).toStrictEqual(
      [],
    );
    expect(vacuumFaultCodes({ vacuum_fault_ids: '{"ts":1,"fault":[0]}' })).toStrictEqual([]);
    expect(
      vacuumFaultCodes({ vacuum_fault_ids: '{"ts":1,"fault":[100051,100008]}' }),
    ).toStrictEqual([100051, 100008]);
    expect(() => vacuumFaultCodes({ vacuum_fault_ids: 7 })).toThrow(VacuumValueError);
  });

  it('reads the running job rooms and zones', () => {
    expect(vacuumJob({})).toBeNull();
    expect(
      vacuumJob({ vacuum_job: '{"clean_mode":0,"rooms":[3,4],"zones":[[1,2,3,4,5,6,7,8]]}' }),
    ).toStrictEqual({ rooms: [3, 4], zones: [[1, 2, 3, 4, 5, 6, 7, 8]] });
    expect(vacuumJob({ vacuum_job: '{"clean_mode":0}' })).toStrictEqual({ rooms: [], zones: [] });
  });
});

describe('the roles', () => {
  it('are unique and collide with no standard capability or other role', () => {
    expect(new Set(VACUUM_ROLES).size).toBe(VACUUM_ROLES.length);
    expect(new Set(EXTRA_ROLES).size).toBe(EXTRA_ROLES.length);
    const standard = new Set(Object.keys(CAPABILITY_CATALOGUE));
    expect(VACUUM_ROLES.filter((role) => standard.has(role))).toStrictEqual([]);
    expect(VACUUM_ROLES.every((role) => EXTRA_ROLES.includes(role))).toBe(true);
    expect(VACUUM_ROLES.every((role) => /^vacuum_[a-z0-9_]+$/u.test(role))).toBe(true);
  });

  it('collect the values of a device by role, ignoring other roles', () => {
    const raw: Readonly<Record<string, string | number | boolean>> = {
      'raw:2.2': 4,
      'raw:2.25': false,
      'raw:1.2': 'pv11gl',
      battery: 71,
    };
    const capabilities: readonly {
      key: CapabilityKey;
      role: Parameters<typeof isVacuumValueRole>[0];
    }[] = [
      { key: 'raw:2.2', role: 'vacuum_status' },
      { key: 'raw:2.25', role: 'vacuum_asleep' },
      { key: 'raw:1.2', role: null },
      { key: 'battery', role: 'battery' },
      { key: 'power', role: 'power' },
    ];
    const values = vacuumValuesOf(capabilities, (key) => raw[key]);
    expect(values).toStrictEqual({ vacuum_status: 4, vacuum_asleep: false, battery: 71 });
    expect(vacuumPhase(values)).toBe('cleaning');
    expect(isVacuumValueRole('power')).toBe(false);
  });
});

describe('the room links summary', () => {
  it('accepts a value without a revision and with one', () => {
    expect(VACUUM_ROOM_LINKS_SUMMARY.parse({ linked: 1, unlinked: 0, stale: 0 })).toStrictEqual({
      linked: 1,
      unlinked: 0,
      stale: 0,
    });
    expect(
      VACUUM_ROOM_LINKS_SUMMARY.parse({ linked: 1, unlinked: 0, stale: 0, revision: 3 }).revision,
    ).toBe(3);
  });
});
