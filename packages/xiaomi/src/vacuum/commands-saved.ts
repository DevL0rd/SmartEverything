import {
  decodePresetLabels,
  decodeRestrictedAreas,
  decodeVirtualWalls,
  encodePreset,
  encodeRestrictedAreas,
  encodeVirtualWalls,
  type RestrictedAreaDraft,
  type VacuumPreset,
  type VacuumPresetLabel,
  type VirtualWallDraft,
} from './codecs';
import {
  VacuumCommandError,
  attempt,
  make,
  reader,
  tagged,
  type VacuumCommand,
  type VacuumPushed,
} from './commands';
import { vacuumAction, vacuumProperty } from './pv11gl-catalog';

export const RESTRICTIONS_MAX = 10;

export function setRestrictions(
  areas: readonly RestrictedAreaDraft[],
  walls: readonly VirtualWallDraft[],
): VacuumCommand {
  if (areas.length + walls.length > RESTRICTIONS_MAX) {
    throw new VacuumCommandError(
      'set-restrictions',
      `at most ${String(RESTRICTIONS_MAX)} areas and walls`,
      String(areas.length + walls.length),
    );
  }
  const areaText = encodeRestrictedAreas(areas);
  const wallText = encodeVirtualWalls(walls);
  const area = vacuumProperty('vacuum', 'restricted-sweep-areas');
  const wall = vacuumProperty('vacuum', 'restricted-walls');
  const properties = [
    { siid: area.siid, piid: area.piid, value: areaText },
    { siid: wall.siid, piid: wall.piid, value: wallText },
  ];
  return make(
    'set-restrictions',
    { action: null, properties },
    {
      summary: 'both lists read back as written',
      met: (pushed) => {
        const read = reader(pushed, 'vacuum');
        const areaValue = read('restricted-sweep-areas');
        const wallValue = read('restricted-walls');
        return (
          typeof areaValue === 'string' &&
          typeof wallValue === 'string' &&
          attempt(() => encodeRestrictedAreas(decodeRestrictedAreas(areaValue))) === areaText &&
          attempt(() => encodeVirtualWalls(decodeVirtualWalls(wallValue))) === wallText
        );
      },
    },
  );
}

export const PRESETS_MAX = 5;
const PRESET_SWEEP_TYPE = 7;

function presetLabelsMet(
  match: (labels: readonly VacuumPresetLabel[]) => boolean,
): (pushed: VacuumPushed) => boolean {
  return (pushed) => {
    const value = reader(pushed, 'vacuum')('user-define-sweep-cfg');
    const labels = typeof value === 'string' ? attempt(() => decodePresetLabels(value)) : null;
    return labels !== null && match(labels);
  };
}

function checkedPresetName(
  command: string,
  preset: VacuumPreset,
  existing: readonly VacuumPresetLabel[],
): void {
  if (existing.some((label) => label.id !== preset.id && label.name === preset.name)) {
    throw new VacuumCommandError(command, 'a name no other preset uses', preset.name);
  }
}

export function presetAdd(
  preset: VacuumPreset,
  existing: readonly VacuumPresetLabel[],
): VacuumCommand {
  if (existing.filter((label) => label.source === 0).length >= PRESETS_MAX) {
    throw new VacuumCommandError(
      'preset-add',
      `fewer than ${String(PRESETS_MAX)} presets`,
      String(existing.length),
    );
  }
  const entry = { ...preset, id: -1 };
  checkedPresetName('preset-add', entry, existing);
  const action = vacuumAction('vacuum', 'add-user-sweep-setting');
  return make(
    'preset-add',
    { action, inputs: [tagged(action, encodePreset(entry))] },
    {
      summary: 'the preset list holds the name',
      met: presetLabelsMet((labels) => labels.some((label) => label.name === entry.name)),
    },
  );
}

export function presetModify(
  preset: VacuumPreset,
  existing: readonly VacuumPresetLabel[],
): VacuumCommand {
  checkedPresetName('preset-modify', preset, existing);
  const action = vacuumAction('vacuum', 'modify-user-sweep-setting');
  return make(
    'preset-modify',
    { action, inputs: [tagged(action, encodePreset(preset))] },
    {
      summary: 'the preset with this id carries the name',
      met: presetLabelsMet((labels) =>
        labels.some((label) => label.id === preset.id && label.name === preset.name),
      ),
    },
  );
}

export function presetDelete(id: number): VacuumCommand {
  const action = vacuumAction('vacuum', 'del-user-sweep-setting');
  return make(
    'preset-delete',
    { action, inputs: [tagged(action, id)] },
    {
      summary: 'no preset with this id is left',
      met: presetLabelsMet((labels) => labels.every((label) => label.id !== id)),
    },
  );
}

export function presetStart(id: number): VacuumCommand {
  const action = vacuumAction('vacuum', 'start-user-define-sweep');
  return make(
    'preset-start',
    { action, inputs: [tagged(action, id)] },
    {
      summary: 'sweep type custom cleanup',
      met: (pushed) => reader(pushed, 'vacuum')('sweep-type') === PRESET_SWEEP_TYPE,
    },
  );
}
