import { describe, expect, it } from 'vitest';
import { devicePlaces } from '../../../search/device-places';
import { placesOwnCapabilities } from '../model/control-groups';
import { modeControlsOf, shownSegments } from './model/clean-modes';
import { presentedFor } from './model/presented-refs';
import { VACUUM_HOMES, homeKeysOf, withoutHomeOf, type VacuumHome } from './page-homes';
import { ROBOT_MAPS_REFS } from './search-items';
import { vacuumDevice, vacuumPresentation } from './sections/settings-fixture';

const device = vacuumDevice();
const presentation = vacuumPresentation(device);
const homes = homeKeysOf(presentation);

function homeOf(ref: string): readonly VacuumHome[] {
  const presented = presentedFor(presentation, ref);
  if (presented === undefined) {
    throw new Error(`The pv11gl has no ${ref}`);
  }
  return homes.get(presented.key) ?? [];
}

describe('vacuum page homes over the pv11gl catalogue', () => {
  it('gives every control, setting and extra a home, so nothing falls to Other', () => {
    expect(withoutHomeOf(presentation).map((presented) => presented.key)).toStrictEqual([]);
  });

  it('places each capability in exactly one home', () => {
    const repeated = [...homes].filter(([, places]) => places.length > 1);
    expect(repeated).toStrictEqual([]);
  });

  it('resolves every listed home entry on the real robot', () => {
    const missing = VACUUM_HOMES.flatMap(({ refs }) =>
      refs.filter((ref) => ref !== 'dnd' && presentedFor(presentation, ref) === undefined),
    );
    expect(missing).toStrictEqual([]);
  });

  it('keeps the primary row commands and their duplicates out of every other home', () => {
    for (const ref of [
      'vacuum_start',
      'vacuum_pause',
      'vacuum_resume',
      'vacuum_dock',
      'vacuum_stop',
      'vacuum_stop_working',
      'vacuum_start_charge',
      'vacuum_identify',
      'vacuum_clean_rooms',
      'vacuum_clean_zones',
      'vacuum_start_sweep_mop',
    ]) {
      expect(homeOf(ref)).toStrictEqual(['hero']);
    }
  });

  it('puts cleaning mode, suction, water, route, passes and presets on the Clean tab', () => {
    for (const ref of [
      'vacuum_mode',
      'suction',
      'mop_level',
      'vacuum_sweep_route',
      'vacuum_repeats',
      'vacuum_worry_free',
      'vacuum_start_user_sweep',
      'vacuum_spot_clean',
    ]) {
      expect(homeOf(ref)).toStrictEqual(['clean']);
    }
  });

  it('puts station settings, tank emptying and consumable resets on the Care tab', () => {
    for (const ref of [
      'vacuum_mop_wash_water',
      'vacuum_mop_wash_frequency',
      'vacuum_roller_auto_wash',
      'vacuum_detergent_amount',
      'vacuum_empty_station_tank',
      'vacuum_reset_filter',
    ]) {
      expect(homeOf(ref)).toStrictEqual(['care']);
    }
  });

  it('keeps quiet hours, find robot and the map tools in their single homes', () => {
    expect(homeOf('vacuum_dnd_period')).toStrictEqual(['settings']);
    expect(homeOf('vacuum_split_room')).toStrictEqual(['not_offered']);
    expect(homeOf('vacuum_merge_rooms')).toStrictEqual(['not_offered']);
    expect(homeOf('vacuum_set_room_settings')).toStrictEqual(['hero']);
  });
});

describe('the map management moved to Robot maps in Settings', () => {
  it('homes every moved map key in Robot maps and nowhere on the vacuum page', () => {
    for (const ref of [
      'vacuum_map_switch',
      'vacuum_build_map',
      'vacuum_save_map',
      'vacuum_auto_partition',
      'vacuum_stop_map_upload',
      'vacuum_restore_map',
      'vacuum_clear_map',
      'vacuum_delete_map',
      'vacuum_set_map',
      'vacuum_set_map_name',
    ]) {
      expect(homeOf(ref)).toStrictEqual(['robot_maps']);
    }
  });

  it('lists exactly the moved keys under Robot maps', () => {
    const moved = VACUUM_HOMES.find(({ home }) => home === 'robot_maps')?.refs;
    expect(moved).toStrictEqual(ROBOT_MAPS_REFS);
    expect(moved).toHaveLength(10);
  });
});

describe('the generic device pages', () => {
  it('are not used for the vacuum, whose page places every capability', () => {
    expect(placesOwnCapabilities('vacuum')).toBe(true);
    expect(placesOwnCapabilities('light')).toBe(false);
    const pages = new Set(devicePlaces(device).map((place) => place.page));
    expect(pages.has('controls')).toBe(false);
    expect(pages.has('settings')).toBe(false);
  });
});

describe('clean mode controls', () => {
  const controls = modeControlsOf(presentation);

  it('shows mode, suction, water, route and passes with their real values', () => {
    expect(controls.map((control) => control.title)).toStrictEqual([
      'Mode',
      'Suction',
      'Water',
      'Route',
      'Passes',
    ]);
    expect(controls[0]?.segments.map((segment) => segment.spoken)).toStrictEqual([
      'Vacuuming',
      'Vacuuming and mopping',
      'Vacuuming before mopping',
    ]);
    expect(controls[1]?.segments.map((segment) => segment.label)).toStrictEqual([
      'Silent',
      'Standard',
      'Strong',
      'Turbo',
    ]);
  });

  it('offers water Off only while the robot only vacuums', () => {
    const water = controls[2];
    if (water === undefined) {
      throw new Error('no water control');
    }
    expect(shownSegments(water, 'Sweep Mop').map((segment) => segment.value)).toStrictEqual([
      'Level1',
      'Level2',
      'Level3',
    ]);
    expect(shownSegments(water, 'Sweep')).toHaveLength(4);
  });
});
