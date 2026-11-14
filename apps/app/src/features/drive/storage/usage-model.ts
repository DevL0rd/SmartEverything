import type {
  DriveQuota,
  DriveRoot,
  DriveStats,
  DriveUsage,
  ProfileRow,
} from '@smarteverything/domain';
import type { BarSegment } from '../../../components/charts';
import type { Tone } from '../../../components/tone';
import type { ColourRole } from '../../../design/tokens';
import { bytes, count } from '../../../format/number';
import { joinParts } from '../../../format/text';

export const QUOTA_WARNING_SHARE = 0.9;

export const USAGE_COLOUR = {
  live: 'viz-blue',
  versions: 'viz-violet',
  trash: 'viz-2',
} as const satisfies Readonly<Record<string, ColourRole>>;

export type UsagePerson = Pick<ProfileRow, 'id' | 'name' | 'colour'>;

export interface PersonUsage {
  readonly person: UsagePerson;
  readonly you: boolean;
  readonly usage: DriveUsage;
  readonly quota: QuotaState;
}

export interface UsageLine {
  readonly segments: readonly BarSegment[];
  readonly total: number;
  readonly used: string;
  readonly counts: string;
  readonly tone: Tone;
}

export function usedOf(usage: Pick<DriveUsage, 'live' | 'versions' | 'trash'>): number {
  return usage.live + usage.versions + usage.trash;
}

export function usageSegmentsOf(
  usage: Pick<DriveUsage, 'live' | 'versions' | 'trash'>,
): readonly BarSegment[] {
  return [
    { label: 'Files', value: usage.live, colour: USAGE_COLOUR.live },
    { label: 'Versions', value: usage.versions, colour: USAGE_COLOUR.versions },
    { label: 'Trash', value: usage.trash, colour: USAGE_COLOUR.trash },
  ];
}

export function quotaToneOf(used: number, quotaBytes: number | null): Tone {
  if (quotaBytes === null) return 'variant';
  if (used >= quotaBytes) return 'critical';
  return used >= quotaBytes * QUOTA_WARNING_SHARE ? 'warning' : 'variant';
}

export function usedTextOf(used: number, quota: QuotaState): string {
  if (!quota.known) return `${bytes(used)} used`;
  return quota.bytes === null
    ? `${bytes(used)} · no limit set`
    : `${bytes(used)} of ${bytes(quota.bytes)}`;
}

export function countsTextOf(usage: Pick<DriveUsage, 'items' | 'folders'>): string {
  return joinParts([
    `${count(usage.items)} ${usage.items === 1 ? 'file' : 'files'}`,
    `${count(usage.folders)} ${usage.folders === 1 ? 'folder' : 'folders'}`,
  ]);
}

export type QuotaState =
  { readonly known: false } | { readonly known: true; readonly bytes: number | null };

export const QUOTA_UNKNOWN: QuotaState = { known: false };

export const NO_QUOTA: QuotaState = { known: true, bytes: null };

export function usageLineOf(usage: DriveUsage, quota: QuotaState): UsageLine {
  const used = usedOf(usage);
  const limit = quota.known ? quota.bytes : null;
  return {
    segments: usageSegmentsOf(usage),
    total: Math.max(used, limit ?? used),
    used: usedTextOf(used, quota),
    counts: countsTextOf(usage),
    tone: quotaToneOf(used, limit),
  };
}

export function quotaOf(
  quotas: readonly DriveQuota[] | null,
  profileId: string | null,
): QuotaState {
  if (quotas === null) return QUOTA_UNKNOWN;
  return {
    known: true,
    bytes: quotas.find((quota) => quota.profileId === profileId)?.bytes ?? null,
  };
}

export interface PeopleInput {
  readonly usage: readonly DriveUsage[];
  readonly quotas: readonly DriveQuota[] | null;
  readonly people: readonly UsagePerson[];
  readonly me: string | null;
}

export function peopleUsageOf(input: PeopleInput): readonly PersonUsage[] {
  const byId = new Map(input.people.map((person) => [person.id, person]));
  return input.usage
    .flatMap((usage) => {
      const person = usage.profileId === null ? undefined : byId.get(usage.profileId);
      return person === undefined
        ? []
        : [
            {
              person,
              you: person.id === input.me,
              usage,
              quota: quotaOf(input.quotas, person.id),
            },
          ];
    })
    .sort((left, right) => usedOf(right.usage) - usedOf(left.usage));
}

export function sharedDriveUsageOf(
  usage: readonly DriveUsage[],
  root: Pick<DriveRoot, 'items' | 'folders' | 'bytes'> | null,
): DriveUsage | null {
  const reported = usage.find((entry) => entry.profileId === null);
  if (reported !== undefined) return reported;
  if (root === null) return null;
  return {
    profileId: null,
    items: root.items,
    folders: root.folders,
    live: root.bytes,
    versions: 0,
    trash: 0,
  };
}

export interface DiskInput {
  readonly stats: Pick<DriveStats, 'space' | 'liveBytes' | 'versionBytes' | 'trashBytes'>;
  readonly usage: readonly DriveUsage[] | null;
  readonly owner: boolean;
}

export interface DiskView {
  readonly segments: readonly BarSegment[];
  readonly total: number;
  readonly used: string;
  readonly free: string;
  readonly fsType: string;
  readonly tone: Tone;
}

export const DISK_WARNING_SHARE = 0.9;

function drivesBytesOf(input: DiskInput): number {
  if (input.owner && input.usage !== null) {
    return input.usage.reduce((all, entry) => all + usedOf(entry), 0);
  }
  return input.stats.liveBytes + input.stats.versionBytes + input.stats.trashBytes;
}

export function diskViewOf(input: DiskInput): DiskView {
  const { space } = input.stats;
  const used = space.totalBytes - space.freeBytes;
  const drives = Math.min(used, drivesBytesOf(input));
  return {
    segments: [
      {
        label: input.owner ? 'Drives' : 'Your drives',
        value: drives,
        colour: 'viz-blue',
      },
      {
        label: input.owner ? 'Other Hub data' : 'Everything else',
        value: used - drives,
        colour: 'viz-violet',
      },
    ],
    total: space.totalBytes,
    used: `${bytes(used)} of ${bytes(space.totalBytes)} used`,
    free: `${bytes(space.freeBytes)} free`,
    fsType: space.fsType,
    tone:
      space.totalBytes > 0 && used / space.totalBytes >= DISK_WARNING_SHARE ? 'warning' : 'variant',
  };
}

export function peopleCaptionOf(people: readonly PersonUsage[]): string {
  const total = people.reduce((all, entry) => all + usedOf(entry.usage), 0);
  return `${count(people.length)} ${people.length === 1 ? 'person' : 'people'} · ${bytes(total)} in their drives`;
}
