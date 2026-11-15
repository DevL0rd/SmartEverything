import type {
  DriveItem,
  PlannerAlarmSound,
  PlannerRadioResult,
  PlannerSleepSound,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

export type SoundTab = 'tones' | 'music' | 'radio';

export type SoundUse = 'alarm' | 'sleep';

export type ChosenSound = PlannerAlarmSound | PlannerSleepSound;

export type MediaSound = Extract<
  PlannerAlarmSound,
  { readonly kind: 'file' | 'playlist' | 'radio' }
>;

export interface SoundCopy {
  readonly radioTitle: string;
  readonly radioBody: string;
  readonly folderPick: string;
  readonly folderActive: string;
  readonly folderNote: string;
  readonly albumPick: string;
  readonly albumActive: string;
  readonly albumNote: string;
  readonly noDrive: string;
}

export const SOUND_COPY: Readonly<Record<SoundUse, SoundCopy>> = {
  alarm: {
    radioTitle: 'Wake to a radio station',
    radioBody: 'Search the public radio directory by name. Radio needs the internet when it rings.',
    folderPick: 'Wake to this folder',
    folderActive: 'Waking to this folder',
    folderNote:
      'A different song from this folder each morning. Songs are saved on the phone ahead of time.',
    albumPick: 'Wake to this album',
    albumActive: 'Waking to this album',
    albumNote:
      'A different song from this album each morning. Songs are saved on the phone ahead of time.',
    noDrive: 'Set up Drive to wake to your own music.',
  },
  sleep: {
    radioTitle: 'Fall asleep to a radio station',
    radioBody:
      'Search the public radio directory by name. Radio needs the internet while it plays.',
    folderPick: 'Play this folder',
    folderActive: 'Playing this folder',
    folderNote: 'Every song in this folder, one after another, until the sleep timer ends.',
    albumPick: 'Play this album',
    albumActive: 'Playing this album',
    albumNote: 'Every song in this album, one after another, until the sleep timer ends.',
    noDrive: 'Set up Drive to fall asleep to your own music.',
  },
};

export interface Tone {
  readonly id: string;
  readonly label: string;
}

export const SYSTEM_TONE = 'default';

export const TONES: readonly Tone[] = [{ id: SYSTEM_TONE, label: 'System alarm tone' }];

export const SOUND_TABS: readonly { readonly value: SoundTab; readonly label: string }[] = [
  { value: 'tones', label: 'Tones' },
  { value: 'music', label: 'Music' },
  { value: 'radio', label: 'Radio' },
];

const SOUND_ICON: Readonly<Record<PlannerAlarmSound['kind'], IconName>> = {
  tone: 'bell',
  file: 'music',
  playlist: 'music',
  radio: 'radio',
};

export function toneLabelOf(id: string): string {
  const known = TONES.find((tone) => tone.id === id);
  if (known !== undefined) return known.label;
  const words = id.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function soundTabOf(sound: PlannerAlarmSound): SoundTab {
  if (sound.kind === 'tone') return 'tones';
  return sound.kind === 'radio' ? 'radio' : 'music';
}

export function soundIconOf(sound: PlannerAlarmSound): IconName {
  return SOUND_ICON[sound.kind];
}

export function musicItemIdOf(sound: ChosenSound | null): string | null {
  if (sound === null) return null;
  return sound.kind === 'file' || sound.kind === 'playlist' ? sound.item_id : null;
}

export function soundTextOf(sound: PlannerAlarmSound, itemName: string | null): string {
  switch (sound.kind) {
    case 'tone':
      return toneLabelOf(sound.id);
    case 'file':
      return itemName ?? 'Song from Drive';
    case 'playlist':
      return `${itemName ?? 'Playlist from Drive'}${sound.shuffle ? ', shuffled' : ', in order'}`;
    case 'radio':
      return sound.name;
  }
}

export function soundKindTextOf(sound: PlannerAlarmSound): string {
  switch (sound.kind) {
    case 'tone':
      return 'Tone';
    case 'file':
      return 'Song';
    case 'playlist':
      return 'Playlist';
    case 'radio':
      return 'Radio';
  }
}

export function toneSound(id: string): PlannerAlarmSound {
  return { kind: 'tone', id };
}

export function fileSound(itemId: string): MediaSound {
  return { kind: 'file', item_id: itemId };
}

export function playlistSound(itemId: string, shuffle: boolean): MediaSound {
  return { kind: 'playlist', item_id: itemId, shuffle };
}

export function radioSound(station: PlannerRadioResult): MediaSound {
  return { kind: 'radio', station_id: station.station_id, name: station.name, url: station.url };
}

function soundKeyOf(sound: ChosenSound): string {
  switch (sound.kind) {
    case 'tone':
      return `tone:${sound.id}`;
    case 'noise':
      return `noise:${sound.colour}`;
    case 'radio':
      return `radio:${sound.station_id}`;
    case 'file':
    case 'playlist':
      return `${sound.kind}:${sound.item_id}`;
  }
}

export function isChosen(current: ChosenSound | null, candidate: ChosenSound): boolean {
  return current !== null && soundKeyOf(current) === soundKeyOf(candidate);
}

export function radioQueryOf(text: string): string | null {
  const query = text.trim();
  return query === '' ? null : query;
}

export function radioDetailOf(station: PlannerRadioResult): string | null {
  const parts = [
    station.country,
    station.codec,
    station.bitrate === null ? null : `${String(station.bitrate)} kbps`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}

export function needsNetwork(sound: PlannerAlarmSound): boolean {
  return sound.kind === 'radio';
}

export type MusicCrumb =
  | {
      readonly kind: 'folder';
      readonly rootId: string;
      readonly folderId: string | null;
      readonly name: string;
    }
  | { readonly kind: 'album'; readonly albumId: string; readonly name: string };

export function crumbKeyOf(crumb: MusicCrumb): string {
  return crumb.kind === 'album'
    ? `album:${crumb.albumId}`
    : `folder:${crumb.rootId}:${crumb.folderId ?? ''}`;
}

export function playlistIdOf(crumb: MusicCrumb): string | null {
  return crumb.kind === 'album' ? crumb.albumId : crumb.folderId;
}

export function musicItemsOf<T extends Pick<DriveItem, 'kind' | 'name'>>(
  items: readonly T[],
): readonly T[] {
  return items.filter((item) => item.kind === 'folder' || item.kind === 'audio');
}

export function openedCrumbs(
  crumbs: readonly MusicCrumb[],
  item: Pick<DriveItem, 'rootId' | 'id' | 'name'>,
): readonly MusicCrumb[] {
  return [...crumbs, { kind: 'folder', rootId: item.rootId, folderId: item.id, name: item.name }];
}
