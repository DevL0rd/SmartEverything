import type {
  DriveConflict,
  DriveConflictResolution,
  DriveItem,
  DriveVersion,
} from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { clock, dayLabel } from '../../../format/time';
import { CURRENT, type Clock, type VersionPicks } from '../versions/versions-model';

export interface ConflictSides {
  readonly hub: string | null;
  readonly client: string;
}

export interface ConflictMaker {
  readonly deviceId: string | null;
  readonly profileId: string | null;
}

export interface ConflictNamers {
  readonly deviceName: (deviceId: string) => string | null;
  readonly byName: (profileId: string | null) => string | null;
}

export const UNKNOWN_CLIENT = 'the other computer';

export const KEEP_NOTE = 'The copy you don’t keep stays in Versions or Trash.';

export const BANNER_NOTE = 'Pick the copy to keep. The other one stays in Versions or Trash.';

export const COMPARE_LABEL = 'Compare the two';

export const EDIT_BEATS_DELETE_TITLE = 'An edit beats a delete';

export const EDIT_BEATS_DELETE_BODY =
  'When one computer deletes a file while another changes it, the change wins and the file stays.';

export const GOT_IT = 'Got it';

export const RESOLVE_FAILED = 'The conflict was not settled.';

export function hubMakerOf(
  item: Pick<DriveItem, 'rev' | 'addedByProfileId'>,
  versions: readonly DriveVersion[],
  hubRev: number,
): ConflictMaker | null {
  const write = versions.find((version) => version.rev === hubRev - 1);
  if (write !== undefined) return { deviceId: write.deviceId, profileId: write.actorProfileId };
  return hubRev === 1 ? { deviceId: null, profileId: item.addedByProfileId } : null;
}

function makerName(maker: ConflictMaker | null, namers: ConflictNamers): string | null {
  if (maker === null) return null;
  const device = maker.deviceId === null ? null : namers.deviceName(maker.deviceId);
  return device ?? namers.byName(maker.profileId);
}

export function sidesOf(
  conflict: Pick<DriveConflict, 'deviceId'>,
  hubMaker: ConflictMaker | null,
  namers: ConflictNamers,
): ConflictSides {
  return {
    hub: makerName(hubMaker, namers),
    client: namers.deviceName(conflict.deviceId) ?? UNKNOWN_CLIENT,
  };
}

function capitalised(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

const YOU = 'You';

function inSentence(name: string): string {
  return name === YOU ? 'you' : name;
}

export function sentenceOf(sides: ConflictSides): string {
  const other =
    sides.hub === null || sides.hub === sides.client ? 'the hub' : inSentence(sides.hub);
  return `${capitalised(sides.client)} and ${other} changed it before they synced`;
}

export type ConflictButtonVariant = 'tonal' | 'outlined';

export interface ConflictAction {
  readonly resolution: DriveConflictResolution;
  readonly label: string;
  readonly variant: ConflictButtonVariant;
}

export function keepLabelOf(resolution: DriveConflictResolution, sides: ConflictSides): string {
  switch (resolution) {
    case 'keep_hub':
      return sides.hub === null ? 'Keep hub version' : `Keep hub version (${sides.hub})`;
    case 'keep_client':
      return sides.client === UNKNOWN_CLIENT
        ? 'Keep the other version'
        : `Keep ${sides.client} version`;
    case 'keep_both':
      return 'Keep both';
  }
}

const POINTER_ORDER: readonly DriveConflictResolution[] = ['keep_hub', 'keep_client', 'keep_both'];

const TOUCH_ORDER: readonly DriveConflictResolution[] = ['keep_both', 'keep_hub', 'keep_client'];

export function conflictActionsOf(sides: ConflictSides, pointer: boolean): ConflictAction[] {
  return (pointer ? POINTER_ORDER : TOUCH_ORDER).map((resolution) => ({
    resolution,
    label: keepLabelOf(resolution, sides),
    variant: resolution === 'keep_both' ? 'tonal' : 'outlined',
  }));
}

export function resolvedMessageOf(
  resolution: DriveConflictResolution,
  sides: ConflictSides,
): string {
  switch (resolution) {
    case 'keep_hub':
      return 'Kept the hub version';
    case 'keep_client':
      return sides.client === UNKNOWN_CLIENT
        ? 'Kept the other version'
        : `Kept the ${sides.client} version`;
    case 'keep_both':
      return 'Kept both copies';
  }
}

function versionKeyAt(
  item: Pick<DriveItem, 'rev'>,
  versions: readonly DriveVersion[],
  rev: number,
): string | null {
  if (item.rev === rev) return CURRENT;
  return versions.find((version) => version.rev === rev)?.id ?? null;
}

export function comparePicksOf(
  conflict: Pick<DriveConflict, 'hubRev' | 'baseRev'>,
  item: Pick<DriveItem, 'rev'>,
  versions: readonly DriveVersion[],
): VersionPicks | null {
  const a = versionKeyAt(item, versions, conflict.hubRev);
  if (a === null) return null;
  const b = versionKeyAt(item, versions, conflict.baseRev);
  return { a, b: b === a ? null : b };
}

export interface CopyWell {
  readonly title: string;
  readonly name: string;
  readonly detail: string;
}

interface CopyStamp {
  readonly at: string | null;
  readonly bytes: number | null;
}

function hubStampOf(
  item: Pick<DriveItem, 'rev' | 'modifiedAt' | 'bytes'>,
  versions: readonly DriveVersion[],
  hubRev: number,
): CopyStamp {
  if (item.rev === hubRev) return { at: item.modifiedAt, bytes: item.bytes };
  const kept = versions.find((version) => version.rev === hubRev);
  const made = versions.find((version) => version.rev === hubRev - 1);
  return { at: made?.at ?? null, bytes: kept?.bytes ?? null };
}

function detailOf(stamp: CopyStamp, time: Clock): string {
  return joinParts([
    stamp.at === null
      ? null
      : `${dayLabel(stamp.at, time.now, time.zone)} ${clock(stamp.at, time.zone)}`,
    stamp.bytes === null ? null : bytes(stamp.bytes),
  ]);
}

export interface WellInput {
  readonly conflict: Pick<DriveConflict, 'hubRev'>;
  readonly sides: ConflictSides;
  readonly item: Pick<DriveItem, 'rev' | 'modifiedAt' | 'bytes'> | null;
  readonly copy: Pick<DriveItem, 'modifiedAt' | 'bytes'> | null;
  readonly versions: readonly DriveVersion[];
  readonly time: Clock;
}

export function copyWellsOf(input: WellInput): readonly [CopyWell, CopyWell] {
  const { conflict, sides, item, copy, versions, time } = input;
  const hub =
    item === null ? { at: null, bytes: null } : hubStampOf(item, versions, conflict.hubRev);
  const client =
    copy === null ? { at: null, bytes: null } : { at: copy.modifiedAt, bytes: copy.bytes };
  const known = sides.client !== UNKNOWN_CLIENT;
  return [
    { title: 'Hub version', name: sides.hub ?? 'The hub', detail: detailOf(hub, time) },
    {
      title: known ? `${sides.client} version` : 'Other version',
      name: known ? sides.client : capitalised(UNKNOWN_CLIENT),
      detail: detailOf(client, time),
    },
  ];
}

export function openConflictsOf(conflicts: readonly DriveConflict[]): DriveConflict[] {
  return conflicts.filter((conflict) => conflict.resolvedAt === null);
}
