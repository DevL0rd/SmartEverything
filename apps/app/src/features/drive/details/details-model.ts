import type { DriveItem, DrivePlacement, DriveVersion } from '@smarteverything/domain';
import type { Bar } from '../../../components/charts/bars';
import type { StatusTone } from '../../../components/tone';
import { bytes } from '../../../format/number';
import { dayKeyOf, shiftDay, startOfDayKey } from '../../../format/time';
import { canWrite, driveOfRootId, type DriveAccess } from '../model/drive-access';
import { isContentItem } from '../model/item-content';
import { ROLE_LABEL } from '../share/share-model';
import { accessOfItem, coverOf, type DriveWorld } from '../source/drive-places';

export interface DetailsSubject {
  readonly rootId: string;
  readonly ownerProfileId: string | null;
  readonly versionsKept: boolean | null;
  readonly item: DriveItem;
  readonly access: DriveAccess;
  readonly writable: boolean;
}

export function detailsSubjectOf(world: DriveWorld, item: DriveItem): DetailsSubject {
  const root = driveOfRootId(world.roots, item.rootId);
  const access = accessOfItem(world, item);
  return {
    rootId: item.rootId,
    ownerProfileId: root?.ownerProfileId ?? coverOf(world.shared, item)?.grantedBy ?? null,
    versionsKept: root?.versions ?? null,
    item,
    access,
    writable: canWrite(access),
  };
}

export const RING_SIZE = 16;

export const RING_THICKNESS = 3;

export interface RingDot {
  readonly key: string;
  readonly name: string;
  readonly tone: StatusTone | null;
}

export interface ComputerRing extends RingDot {
  readonly share: number;
  readonly word: string;
}

type PlacementFacts = Pick<DrivePlacement, 'id' | 'mode' | 'hold'> & {
  readonly status: Pick<DrivePlacement['status'], 'state' | 'needBytes'>;
};

interface RingLook {
  readonly tone: StatusTone | null;
  readonly word: string;
}

function stateLookOf(placement: PlacementFacts): RingLook {
  const { state, needBytes } = placement.status;
  switch (state) {
    case 'up_to_date':
      return { tone: 'positive', word: 'up to date' };
    case 'mounted':
      return { tone: 'positive', word: 'mounted' };
    case 'syncing':
      return { tone: 'info', word: `${bytes(needBytes)} left` };
    case 'starting':
      return { tone: 'info', word: 'starting' };
    case 'offline':
      return { tone: null, word: 'offline' };
    case 'stopped':
      return { tone: null, word: 'paused' };
    case 'blocked':
      return { tone: 'warning', word: 'blocked' };
    case 'failed':
      return {
        tone: 'critical',
        word: placement.mode === 'mounted' ? 'mount failed' : 'sync failed',
      };
  }
}

export function haveShare(placedBytes: number, needBytes: number): number {
  if (needBytes <= 0) return 1;
  return 1 - needBytes / Math.max(placedBytes, needBytes);
}

export function placementRingOf(
  placement: PlacementFacts,
  name: string,
  placedBytes: number,
): ComputerRing {
  const look: RingLook =
    placement.hold === null ? stateLookOf(placement) : { tone: 'warning', word: 'on hold' };
  const share =
    placement.mode === 'synced' ? haveShare(placedBytes, placement.status.needBytes) : 1;
  return { key: placement.id, name, tone: look.tone, share, word: look.word };
}

export function coversItem(folderRelPath: string | null, itemRelPath: string): boolean {
  if (folderRelPath === null) return true;
  return itemRelPath === folderRelPath || itemRelPath.startsWith(`${folderRelPath}/`);
}

export interface WhoSees {
  readonly access: DriveAccess;
  readonly ownerName: string | null;
  readonly people: readonly string[];
}

function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

export function whoSeesOf(who: WhoSees): string {
  switch (who.access) {
    case 'shared':
      return 'Everyone in the home';
    case 'own':
      return who.people.length === 0 ? 'Only you' : `You and ${listed(who.people)}`;
    case 'edit':
    case 'view':
      return `Shared with you by ${who.ownerName ?? 'its owner'} · ${ROLE_LABEL[who.access]}`;
    case 'none':
      return `Shared with you by ${who.ownerName ?? 'its owner'}`;
  }
}

export interface IntegrityLine {
  readonly text: string;
  readonly tone: StatusTone | null;
}

export function integrityOf(item: DriveItem): IntegrityLine | null {
  if (!isContentItem(item)) return null;
  switch (item.integrity) {
    case 'ok':
      return { text: 'Checked, no damage found', tone: 'positive' };
    case 'corrupt':
      return { text: 'Damaged on disk. Restore an earlier version.', tone: 'critical' };
    case 'unknown':
      return { text: 'Not checked yet', tone: null };
  }
}

export const EDIT_DAYS = 30;

export function editWindowStart(today: string): number {
  return startOfDayKey(shiftDay(today, 1 - EDIT_DAYS));
}

export function editsPerDay(versions: readonly DriveVersion[], today: string): readonly Bar[] {
  const counts = new Map<string, number>();
  for (const version of versions) {
    const day = dayKeyOf(Date.parse(version.at));
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from({ length: EDIT_DAYS }, (_unused, index) => {
    const day = shiftDay(today, index + 1 - EDIT_DAYS);
    return { key: day, value: counts.get(day) ?? 0 };
  });
}

export function editsTotal(bars: readonly Bar[]): number {
  return bars.reduce((sum, bar) => sum + bar.value, 0);
}

export function needsOlderVersions(
  versions: readonly DriveVersion[],
  windowStart: number,
  hasNext: boolean,
): boolean {
  if (!hasNext) return false;
  const oldest = versions.at(-1);
  return oldest === undefined || Date.parse(oldest.at) >= windowStart;
}
