import {
  deviceFamily,
  jsonEquals,
  roomLightTargets,
  type BoardWidget,
  type DeviceGroupRow,
  type DeviceRow,
} from '@smarteverything/domain';
import type { PickerState, TargetRow, TargetSection } from '../../components/widget-board';
import { compareText, plural } from '../../format/text';

const ON_PAGE = 'On this page';

function isLight(device: DeviceRow): boolean {
  return deviceFamily(device) === 'light';
}

function membersOf(group: DeviceGroupRow, devices: readonly DeviceRow[]): readonly DeviceRow[] {
  return devices.filter((device) => group.device_ids.includes(device.id));
}

interface RowSpec {
  readonly key: string;
  readonly title: string;
  readonly count: number;
  readonly noun: string;
  readonly options: TargetRow['options'];
}

function rowFor({ key, title, count, noun, options }: RowSpec): TargetRow {
  return { key, title, subtitle: plural(count, noun), options };
}

function groupRows(
  state: PickerState,
  accept: (members: readonly DeviceRow[]) => boolean,
  noun: string,
): readonly TargetRow[] {
  return state.groups.flatMap((group) => {
    const members = membersOf(group, state.devices);
    return members.length > 0 && accept(members)
      ? [
          rowFor({
            key: `group:${group.id}`,
            title: group.name,
            count: members.length,
            noun,
            options: { target: { kind: 'group', groupId: group.id } },
          }),
        ]
      : [];
  });
}

function roomRows(state: PickerState): readonly TargetRow[] {
  return roomLightTargets(state.devices, state.rooms, compareText).flatMap((entry) =>
    entry.target.kind === 'room'
      ? [
          rowFor({
            key: entry.key,
            title: entry.name,
            count: entry.members.length,
            noun: 'light',
            options: { target: { kind: 'room', roomId: entry.target.roomId, families: ['light'] } },
          }),
        ]
      : [],
  );
}

function marked(rows: readonly TargetRow[], placed: readonly BoardWidget[]): readonly TargetRow[] {
  return rows.map((row) =>
    placed.some((widget) => widget.options !== undefined && jsonEquals(widget.options, row.options))
      ? { ...row, note: ON_PAGE }
      : row,
  );
}

function section(title: string, rows: readonly TargetRow[]): readonly TargetSection[] {
  return rows.length === 0 ? [] : [{ title, rows }];
}

export function lightGroupSections(
  state: PickerState,
  placed: readonly BoardWidget[],
): readonly TargetSection[] {
  return [
    ...section(
      'Light groups',
      marked(
        groupRows(state, (members) => members.every(isLight), 'light'),
        placed,
      ),
    ),
    ...section('Room lights', marked(roomRows(state), placed)),
  ];
}

export function mixedGroupSections(
  state: PickerState,
  placed: readonly BoardWidget[],
): readonly TargetSection[] {
  return section(
    'Device groups',
    marked(
      groupRows(state, (members) => !members.every(isLight), 'device'),
      placed,
    ),
  );
}

export function lightGroupSuggestions(state: PickerState): readonly TargetRow[] {
  return groupRows(state, (members) => members.every(isLight), 'light');
}
