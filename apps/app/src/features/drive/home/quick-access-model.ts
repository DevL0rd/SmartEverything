import type { DriveRecentEntry } from '@smarteverything/domain';
import { relative } from '../../../format/time';

export const OUTSIDE_CAPTION = 'Changed outside SmartEverything';

export interface RecentNames {
  readonly me: string | null;
  readonly people: Readonly<Record<string, string>>;
  readonly devices: Readonly<Record<string, string>>;
}

type Written = Extract<DriveRecentEntry, { readonly kind: 'added' | 'changed' }>;

const FIXED_ACTOR: Readonly<Partial<Record<Written['via'], string>>> = {
  ai: 'the AI',
  automation: 'an automation',
  scan: 'a scan',
};

const VERB: Readonly<Record<Written['kind'], string>> = { added: 'Added', changed: 'Edited' };

function actorOf(entry: Written, names: RecentNames): string {
  const fixed = FIXED_ACTOR[entry.via];
  if (fixed !== undefined) return fixed;
  const person = entry.actorProfileId;
  if (person !== null && person === names.me) return 'you';
  const name = person === null ? undefined : names.people[person];
  if (name !== undefined) return name;
  if (entry.via === 'share') return 'someone with a link';
  const device = entry.deviceId === null ? undefined : names.devices[entry.deviceId];
  return device ?? 'someone';
}

export function recentCaptionOf(entry: DriveRecentEntry, names: RecentNames, now: number): string {
  const when = relative(entry.at, now);
  if (entry.kind === 'opened') return `Opened ${when}`;
  if (entry.via === 'outside') return `${OUTSIDE_CAPTION} · ${when}`;
  return `${VERB[entry.kind]} ${when} by ${actorOf(entry, names)}`;
}

export function recentKeyOf(entry: DriveRecentEntry): string {
  return `${entry.kind}\n${entry.item.id}\n${entry.at}`;
}

export function entriesInDrive(
  entries: readonly DriveRecentEntry[],
  rootId: string,
): readonly DriveRecentEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (entry.item.rootId !== rootId || entry.item.kind === 'folder') return false;
    if (seen.has(entry.item.id)) return false;
    seen.add(entry.item.id);
    return true;
  });
}

export function recentIdsOf(entries: readonly DriveRecentEntry[]): {
  readonly people: readonly string[];
  readonly devices: readonly string[];
} {
  const written = entries.filter((entry): entry is Written => entry.kind !== 'opened');
  return {
    people: [...new Set(written.flatMap((entry) => entry.actorProfileId ?? []))],
    devices: [...new Set(written.flatMap((entry) => entry.deviceId ?? []))],
  };
}
