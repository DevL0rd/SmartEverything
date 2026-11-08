import { VACUUM_STATION_MODES, VACUUM_STATION_ACTION_ROLES } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  SETTING_ROLES,
  actionBlockedReason,
  START_ACTIONS,
  TANKS,
  blockedReason,
  dryLeftText,
  emptyingLook,
  isEmptying,
  isNotInstalled,
  reportedTanks,
  sewageLook,
  stationDisplay,
  stationOf,
  waterLook,
} from './dock-model';

function station(mode: number, progress?: number): ReturnType<typeof stationOf> {
  const text = JSON.stringify(progress === undefined ? { mode } : { mode, progress });
  return stationOf({ vacuum_station_mode: text });
}

describe('station state', () => {
  it('words every station mode of the table, including cut hair, air dry and rewash', () => {
    const words = VACUUM_STATION_MODES.map((row) => station(row.value, 40)?.word);
    expect(words).toStrictEqual([
      'Idle',
      'Drying the mop',
      'Emptying the bin',
      'Washing the mop',
      'Clearing hair',
      'Airing the mop',
      'Washing the mop again',
    ]);
  });

  it('shows the progress only while the station works', () => {
    expect(station(0, 0)?.progress).toBeNull();
    expect(station(3, 40)?.progress).toBe(0.4);
    expect(station(1, 250)?.progress).toBe(1);
    expect(station(2)?.progress).toBeNull();
  });

  it('offers Stop only for washing and drying modes, with the matching action', () => {
    const stops = [0, 1, 2, 3, 4, 5, 7].map((mode) => station(mode)?.stop?.role ?? null);
    expect(stops).toStrictEqual([
      null,
      'vacuum_stop_dry',
      null,
      'vacuum_stop_roller_wash',
      null,
      'vacuum_stop_dry',
      'vacuum_stop_roller_wash',
    ]);
  });

  it('names an unknown mode by its number and treats it as busy', () => {
    const state = station(9);
    expect(state?.word).toBe('Station mode 9');
    expect(state?.busy).toBe(true);
  });

  it('is absent without a station value and reports unreadable ones', () => {
    expect(stationOf({})).toBeNull();
    expect(() => stationOf({ vacuum_station_mode: 'nonsense' })).toThrow();
    expect(stationDisplay({ ok: false, problem: 'x' }).word).toBe('Station status unreadable');
    expect(stationDisplay({ ok: true, value: null }).word).toBe('No station status');
  });

  it('says how long drying has left only while drying', () => {
    const drying = station(1, 50);
    expect(dryLeftText({ vacuum_dry_left: 80 }, drying)).toBe('1 h 20 min left');
    expect(dryLeftText({ vacuum_dry_left: 80 }, station(0))).toBeNull();
    expect(dryLeftText({ vacuum_dry_left: 0 }, drying)).toBeNull();
    expect(dryLeftText({}, drying)).toBeNull();
  });
});

describe('when station actions are blocked', () => {
  it('needs an online robot on the station with an idle station', () => {
    const docked = { vacuum_status: 9 };
    expect(blockedReason({ online: true, values: docked, busy: false })).toBeNull();
    expect(blockedReason({ online: false, values: docked, busy: false })).toBe(
      'The robot is offline',
    );
    expect(blockedReason({ online: true, values: { vacuum_status: 4 }, busy: false })).toBe(
      'The robot needs to be on the station',
    );
    expect(blockedReason({ online: true, values: {}, busy: false })).toBe(
      'The robot needs to be on the station',
    );
    expect(blockedReason({ online: true, values: docked, busy: true })).toBe('The station is busy');
  });
});

describe('washing the mop needs an installed mop', () => {
  const docked = { vacuum_status: 9 };
  const wash = 'vacuum_start_roller_wash';

  it('blocks only the wash when the robot reports no mop', () => {
    const values = { ...docked, vacuum_mop_attached: false };
    expect(actionBlockedReason({ role: wash, stationReason: null, values })).toBe(
      'The mop is not installed',
    );
    expect(
      actionBlockedReason({ role: 'vacuum_empty_dust', stationReason: null, values }),
    ).toBeNull();
    expect(actionBlockedReason({ role: 'vacuum_dry_mop', stationReason: null, values })).toBeNull();
  });

  it('allows the wash with a mop and keeps the station reason first', () => {
    const attached = { ...docked, vacuum_mop_attached: true };
    expect(actionBlockedReason({ role: wash, stationReason: null, values: attached })).toBeNull();
    expect(actionBlockedReason({ role: wash, stationReason: null, values: docked })).toBeNull();
    expect(
      actionBlockedReason({
        role: wash,
        stationReason: 'The station is busy',
        values: { ...docked, vacuum_mop_attached: false },
      }),
    ).toBe('The station is busy');
  });
});

describe('tanks', () => {
  it('reads spec names and numbers the same way', () => {
    expect(sewageLook('Full').word).toBe('Full');
    expect(sewageLook(1).tone).toBe('critical');
    expect(sewageLook('Not Full').word).toBe('Not full');
    expect(waterLook('Empty').tone).toBe('warning');
    expect(waterLook(0).word).toBe('Has water');
    expect(sewageLook(7).word).toBe('Unknown');
  });

  it('words the emptying states and detects the running and absent ones', () => {
    expect(emptyingLook('Empting').word).toBe('Emptying');
    expect(emptyingLook(2).word).toBe('Emptying done');
    expect(emptyingLook('Empting Failed').tone).toBe('critical');
    expect(isEmptying(1)).toBe(true);
    expect(isEmptying('Idle')).toBe(false);
    expect(isNotInstalled(4)).toBe(true);
    expect(isNotInstalled('Not Installed')).toBe(true);
    expect(isNotInstalled(0)).toBe(false);
  });

  it('lists only the tanks the robot reports', () => {
    expect(reportedTanks({})).toStrictEqual([]);
    expect(reportedTanks({ vacuum_sewage_tank: 0 }).map((tank) => tank.role)).toStrictEqual([
      'vacuum_sewage_tank',
    ]);
  });
});

describe('station roles', () => {
  it('uses only real station roles and no duplicates', () => {
    const actionRoles = [...START_ACTIONS.map((action) => action.role), 'vacuum_stop_dry'];
    for (const role of actionRoles) {
      expect(VACUUM_STATION_ACTION_ROLES).toContain(role);
    }
    expect(new Set(SETTING_ROLES).size).toBe(SETTING_ROLES.length);
    expect(new Set(TANKS.map((tank) => tank.role)).size).toBe(TANKS.length);
  });

  it('never offers the unproven water self-check or station cleaning', () => {
    const roles = START_ACTIONS.map((action): string => action.role);
    expect(
      roles.some((role) => role.includes('water_check') || role.includes('clean_station')),
    ).toBe(false);
  });
});
