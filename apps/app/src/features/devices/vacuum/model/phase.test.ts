import { VACUUM_STATUS_TABLE, type VacuumValues } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { clock } from '../../../../format/time';
import { isDockedAsleep, vacuumChipOf, vacuumStatusSpec } from './phase-chip';
import { phaseLine, stationPillOf, type PhaseLineInput } from './phase-line';
import { readProblems } from './problems';

function lineOf(values: VacuumValues, extra: Partial<PhaseLineInput> = {}): string {
  return phaseLine({
    values,
    online: true,
    lastSeenMs: null,
    room: null,
    doneAreaM2: null,
    plannedAreaM2: null,
    mapAreaM2: null,
    ...extra,
  });
}

describe('vacuum phase chips', () => {
  it('gives every defined status a chip with an icon and a word', () => {
    for (const entry of VACUUM_STATUS_TABLE) {
      const chip = vacuumChipOf({ vacuum_status: entry.value }, true);
      expect(chip.key).toBe(entry.phase);
      expect(chip.word.length).toBeGreaterThan(0);
      expect(chip.icon.length).toBeGreaterThan(0);
    }
  });

  it('reads the status as a number or as its spec name', () => {
    expect(vacuumChipOf({ vacuum_status: 'Sweeping' }, true).key).toBe('cleaning');
    expect(vacuumStatusSpec({ vacuum_status: 16 })).toBe('Sweeping and Mopping');
    expect(vacuumStatusSpec({})).toBeNull();
  });

  it('shows offline before anything else and unknown for a missing or undefined status', () => {
    expect(vacuumChipOf({ vacuum_status: 4 }, false)).toMatchObject({
      key: 'offline',
      tone: 'offline',
      awake: false,
    });
    expect(vacuumChipOf({}, true).key).toBe('unknown');
    expect(vacuumChipOf({ vacuum_status: 22 }, true).key).toBe('unknown');
  });

  it('marks a docked robot with the asleep flag as asleep and not awake', () => {
    const asleep = { vacuum_status: 9, vacuum_asleep: true };
    expect(isDockedAsleep(asleep)).toBe(true);
    expect(vacuumChipOf(asleep, true)).toMatchObject({ key: 'asleep', awake: false });
    expect(isDockedAsleep({ vacuum_status: 4, vacuum_asleep: true })).toBe(false);
  });

  it('uses the one awake rule of the domain', () => {
    expect(vacuumChipOf({ vacuum_status: 4 }, true).awake).toBe(true);
    expect(vacuumChipOf({ vacuum_status: 5 }, true).awake).toBe(true);
    expect(vacuumChipOf({ vacuum_status: 9, vacuum_asleep: false }, true).awake).toBe(true);
    expect(vacuumChipOf({ vacuum_status: 9 }, true).awake).toBe(false);
  });

  it('gives errors the error tone and paused the paused tone', () => {
    expect(vacuumChipOf({ vacuum_status: 15 }, true).tone).toBe('error');
    expect(vacuumChipOf({ vacuum_status: 5 }, true).tone).toBe('paused');
    expect(vacuumChipOf({ vacuum_status: 6 }, true).tone).toBe('returning');
  });
});

describe('vacuum phase line', () => {
  it('writes the cleaning line with room and area, and the variants of the status', () => {
    const area = { room: 'Kitchen', doneAreaM2: 12, plannedAreaM2: 40 };
    expect(lineOf({ vacuum_status: 4 }, area)).toBe('Cleaning · Kitchen · 12 of 40 m²');
    expect(lineOf({ vacuum_status: 16 }, area)).toBe(
      'Vacuuming and mopping · Kitchen · 12 of 40 m²',
    );
    expect(lineOf({ vacuum_status: 17 }, area)).toBe('Mopping · Kitchen · 12 of 40 m²');
  });

  it('falls back to the progress percent when the area is not known', () => {
    expect(lineOf({ vacuum_status: 4, vacuum_progress: 37.4 }, { room: 'Hall' })).toBe(
      'Cleaning · Hall · 37%',
    );
    expect(lineOf({ vacuum_status: 4 })).toBe('Cleaning');
  });

  it('writes paused, mapping and returning lines', () => {
    expect(lineOf({ vacuum_status: 5 }, { room: 'Kitchen' })).toBe('Paused · Kitchen');
    expect(lineOf({ vacuum_status: 10 }, { mapAreaM2: 6 })).toBe('Mapping · 6 m² so far');
    expect(lineOf({ vacuum_status: 6 })).toBe('Going back to the dock');
    expect(lineOf({ vacuum_status: 19 })).toBe('Going back to charge, then it continues');
    expect(lineOf({ vacuum_status: 20 })).toBe('Going back to wash the mop');
  });

  it('writes docked lines', () => {
    expect(lineOf({ vacuum_status: 9 })).toBe('Docked · charged');
    expect(lineOf({ vacuum_status: 2, battery: 64 })).toBe('Charging · 64%');
    expect(lineOf({ vacuum_status: 3, battery: 64 })).toBe('Charging, then it continues · 64%');
    expect(lineOf({ vacuum_status: 9, vacuum_asleep: true })).toBe('Docked · asleep');
  });

  it('writes the station line from the dock mode, progress and drying time', () => {
    const wash = JSON.stringify({ mode: 3, progress: 40 });
    expect(lineOf({ vacuum_status: 14, vacuum_station_mode: wash })).toBe('Washing the mop · 40%');
    expect(
      lineOf({ vacuum_status: 2, vacuum_station_mode: JSON.stringify({ mode: 7, progress: 10 }) }),
    ).toBe('Washing the mop again · 10%');
    expect(
      lineOf({
        vacuum_status: 9,
        vacuum_station_mode: JSON.stringify({ mode: 1 }),
        vacuum_dry_left: 80,
      }),
    ).toBe('Drying the mop · 1 h 20 min left');
    expect(lineOf({ vacuum_status: 9, vacuum_station_mode: JSON.stringify({ mode: 2 }) })).toBe(
      'Emptying the bin',
    );
    expect(lineOf({ vacuum_status: 9, vacuum_station_mode: JSON.stringify({ mode: 5 }) })).toBe(
      'Airing the mop',
    );
    expect(lineOf({ vacuum_status: 9, vacuum_station_mode: JSON.stringify({ mode: 4 }) })).toBe(
      'Clearing hair from the brush',
    );
  });

  it('writes a short stage pill for the station that agrees with the station line', () => {
    const dry = { vacuum_status: 9, vacuum_station_mode: JSON.stringify({ mode: 1 }) };
    expect(stationPillOf({ ...dry, vacuum_dry_left: 80 })).toBe('Drying · 1 h 20 min left');
    expect(stationPillOf(dry)).toBe('Drying');
    const wash = JSON.stringify({ mode: 3, progress: 40 });
    expect(stationPillOf({ vacuum_status: 14, vacuum_station_mode: wash })).toBe('Washing · 40%');
    expect(
      stationPillOf({ vacuum_status: 9, vacuum_station_mode: JSON.stringify({ mode: 0 }) }),
    ).toBeNull();
  });

  it('ignores the dock mode while the robot is cleaning and when the dock is idle', () => {
    const wash = JSON.stringify({ mode: 3, progress: 40 });
    expect(lineOf({ vacuum_status: 4, vacuum_station_mode: wash })).toBe('Cleaning');
    expect(lineOf({ vacuum_status: 9, vacuum_station_mode: JSON.stringify({ mode: 0 }) })).toBe(
      'Docked · charged',
    );
  });

  it('shows a malformed dock reading as no station activity instead of crashing', () => {
    expect(lineOf({ vacuum_status: 9, vacuum_station_mode: 'not json' })).toBe('Docked · charged');
  });

  it('writes the error, offline and not-yet-reported lines', () => {
    expect(lineOf({ vacuum_status: 15 })).toBe('Needs help');
    expect(
      lineOf({ vacuum_status: 4 }, { online: false, lastSeenMs: Date.UTC(2026, 9, 24, 12, 2) }),
    ).toBe(`Not reachable. Last seen ${clock(Date.UTC(2026, 9, 24, 12, 2))}.`);
    expect(lineOf({ vacuum_status: 4 }, { online: false })).toBe('Not reachable.');
    expect(lineOf({})).toBe('Status not reported yet');
  });

  it('writes the remaining phases', () => {
    expect(lineOf({ vacuum_status: 8 })).toBe('Remote control');
    expect(lineOf({ vacuum_status: 11 })).toBe("Updating the robot's software");
    expect(lineOf({ vacuum_status: 25 })).toBe('Checking itself');
    expect(lineOf({ vacuum_status: 26 })).toBe('Coming to you');
    expect(lineOf({ vacuum_status: 18 })).toBe('Mapping paused');
  });
});

describe('vacuum read problems', () => {
  it('names each reading the robot sent in a shape we cannot read', () => {
    expect(readProblems({ vacuum_status: 9 })).toStrictEqual([]);
    const problems = readProblems({
      vacuum_station_mode: 'not json',
      vacuum_job: '[1]',
      vacuum_fault_ids: JSON.stringify({ fault: [0, 210001] }),
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('vacuum_station_mode');
    expect(problems[1]).toContain('vacuum_job');
  });
});
