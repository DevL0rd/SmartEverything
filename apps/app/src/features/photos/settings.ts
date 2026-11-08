import {
  PHOTOS_GROUPINGS,
  PHOTOS_ZOOMS,
  type PhotosBackupPref,
  type PhotosPref,
} from '@smarteverything/domain';
import { changeBackupEnabled } from './backup/activation';
import { href } from '../../app-shell/hrefs';
import type { IconName } from '../../components/icon';
import type { SettingContext, SettingDefinition, SettingEnv } from '../../settings/types';
import { PREFS, prefValueOf, savePref } from '../../store/prefs';
import type { StoreState } from '../../store/state';

const PAGE = 'photos';
const DRIVE_PAGE = 'drive';
const ZOOM_LABELS = {
  years: 'Years',
  months: 'Months',
  days: 'Days',
  comfortable: 'Comfortable',
} as const satisfies Readonly<Record<(typeof PHOTOS_ZOOMS)[number], string>>;
const GROUP_LABELS = { day: 'Day', month: 'Month' } as const satisfies Readonly<
  Record<(typeof PHOTOS_GROUPINGS)[number], string>
>;

const localDevice = (env: SettingEnv): boolean => env.platform !== 'web';
const ownerOnly = (env: SettingEnv): boolean => env.owner;

const photosOf = (state: StoreState): PhotosPref => prefValueOf(state, PREFS.photos);
const backupOf = (state: StoreState): PhotosBackupPref => prefValueOf(state, PREFS.photosBackup);

function savePhotos(context: SettingContext, patch: Partial<PhotosPref>): Promise<void> {
  savePref(context.store, PREFS.photos, { ...photosOf(context.state), ...patch });
  return Promise.resolve();
}

function saveBackup(context: SettingContext, patch: Partial<PhotosBackupPref>): Promise<void> {
  savePref(context.store, PREFS.photosBackup, { ...backupOf(context.state), ...patch });
  return Promise.resolve();
}

interface PhotosSwitchSpec {
  readonly id: string;
  readonly section: string;
  readonly title: string;
  readonly description?: string;
  readonly icon?: IconName;
  readonly keywords: readonly string[];
  readonly key: {
    readonly [K in keyof PhotosPref]: PhotosPref[K] extends boolean ? K : never;
  }[keyof PhotosPref];
}

function photosSwitch(spec: PhotosSwitchSpec): SettingDefinition {
  const { key } = spec;
  return {
    id: spec.id,
    page: PAGE,
    section: spec.section,
    title: spec.title,
    ...(spec.description === undefined ? {} : { description: spec.description }),
    ...(spec.icon === undefined ? {} : { icon: spec.icon }),
    keywords: spec.keywords,
    scope: 'server',
    control: 'switch',
    read: (state) => photosOf(state)[key],
    write: (value, context) => savePhotos(context, { [key]: value }),
  };
}

interface BackupSwitchSpec {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly keywords: readonly string[];
  readonly key: {
    readonly [K in keyof PhotosBackupPref]: PhotosBackupPref[K] extends boolean ? K : never;
  }[keyof PhotosBackupPref];
}

function backupSwitch(spec: BackupSwitchSpec): SettingDefinition {
  const { key } = spec;
  return {
    id: spec.id,
    page: PAGE,
    section: 'Backup on this device',
    title: spec.title,
    ...(spec.description === undefined ? {} : { description: spec.description }),
    keywords: spec.keywords,
    scope: 'device',
    control: 'switch',
    visible: localDevice,
    read: (state) => backupOf(state)[key],
    write: (value, context) =>
      key === 'enabled'
        ? changeBackupEnabled(context.store, value)
        : saveBackup(context, { [key]: value }),
  };
}

const SOURCES: readonly SettingDefinition[] = [
  photosSwitch({
    id: 'photos.sources.cameras',
    section: 'Sources',
    title: 'Cameras',
    description: 'Show camera recordings and snapshots in Photos.',
    keywords: ['cameras', 'snapshots', 'recordings', 'sources'],
    key: 'showCameras',
  }),
  photosSwitch({
    id: 'photos.sources.ai',
    section: 'Sources',
    title: 'Made with AI',
    description: 'Show images made by the assistant in Photos.',
    keywords: ['ai', 'generated', 'assistant', 'images', 'sources'],
    key: 'showAi',
  }),
  {
    id: 'photos.sources.folders',
    page: PAGE,
    section: 'Sources',
    title: 'Show in Photos per library folder',
    description: 'Choose which library folders appear in Photos in Drive settings.',
    icon: 'folder',
    keywords: ['library', 'folders', 'sources', 'show in photos'],
    scope: 'server',
    control: 'link',
    visible: ownerOnly,
    href: href.settings.focus(DRIVE_PAGE, 'drive.roots'),
  },
];

const TIMELINE: readonly SettingDefinition[] = [
  {
    id: 'photos.timeline.zoom',
    page: PAGE,
    section: 'Timeline',
    title: 'Opens at',
    keywords: ['zoom', 'years', 'months', 'days', 'comfortable', 'timeline'],
    scope: 'server',
    control: 'select',
    inline: true,
    options: PHOTOS_ZOOMS.map((value) => ({ value, label: ZOOM_LABELS[value] })),
    read: (state) => photosOf(state).timelineZoom,
    write: (value, context): Promise<void> => {
      const zoom = PHOTOS_ZOOMS.find((candidate) => candidate === value);
      return zoom === undefined ? Promise.resolve() : savePhotos(context, { timelineZoom: zoom });
    },
  },
  {
    id: 'photos.timeline.group',
    page: PAGE,
    section: 'Timeline',
    title: 'Group by',
    keywords: ['group', 'day', 'month', 'timeline'],
    scope: 'server',
    control: 'select',
    inline: true,
    options: PHOTOS_GROUPINGS.map((value) => ({ value, label: GROUP_LABELS[value] })),
    read: (state) => photosOf(state).timelineGroup,
    write: (value, context): Promise<void> => {
      const group = PHOTOS_GROUPINGS.find((candidate) => candidate === value);
      return group === undefined
        ? Promise.resolve()
        : savePhotos(context, { timelineGroup: group });
    },
  },
  photosSwitch({
    id: 'photos.timeline.videos',
    section: 'Timeline',
    title: 'Show videos',
    keywords: ['videos', 'timeline'],
    key: 'showVideos',
  }),
  photosSwitch({
    id: 'photos.timeline.not_backed_up',
    section: 'Timeline',
    title: 'Show items not backed up',
    description: 'Show photos that are still only on a phone, marked as not backed up.',
    keywords: ['not backed up', 'only on this phone', 'timeline'],
    key: 'showNotBackedUp',
  }),
];

const BACKUP: readonly SettingDefinition[] = [
  backupSwitch({
    id: 'photos.backup.enabled',
    title: 'Back up this device',
    description: 'Copy this device’s photos and videos to your server as originals.',
    keywords: ['backup', 'camera roll', 'upload', 'phone', 'sync'],
    key: 'enabled',
  }),
  backupSwitch({
    id: 'photos.backup.wifi_only',
    title: 'Unmetered networks only',
    description: 'Use Wi-Fi on phones and unmetered connections on computers.',
    keywords: ['wifi', 'mobile data', 'cellular', 'backup'],
    key: 'wifiOnly',
  }),
  backupSwitch({
    id: 'photos.backup.charging_only',
    title: 'While charging only',
    keywords: ['charging', 'battery', 'backup'],
    key: 'chargingOnly',
  }),
  backupSwitch({
    id: 'photos.backup.videos',
    title: 'Include videos',
    keywords: ['videos', 'backup'],
    key: 'includeVideos',
  }),
];

const MEMORIES: readonly SettingDefinition[] = [
  photosSwitch({
    id: 'photos.memories.enabled',
    section: 'Memories',
    title: 'Memories',
    description: 'Suggest on this day, trips and days out.',
    keywords: ['memories', 'on this day', 'trips', 'days out'],
    key: 'memories',
  }),
  {
    id: 'photos.memories.trip_distance',
    page: PAGE,
    section: 'Memories',
    title: 'Trips start this far from home',
    keywords: ['trips', 'distance', 'home', 'kilometres', 'memories'],
    scope: 'server',
    control: 'stepper',
    min: 5,
    max: 20000,
    step: 5,
    unit: 'km',
    read: (state) => photosOf(state).tripDistanceKm,
    write: (value, context) => savePhotos(context, { tripDistanceKm: value }),
  },
  photosSwitch({
    id: 'photos.memories.year_in_review',
    section: 'Memories',
    title: 'Year in review',
    keywords: ['year in review', 'memories', 'annual'],
    key: 'yearInReview',
  }),
];

const MAP: readonly SettingDefinition[] = [
  photosSwitch({
    id: 'photos.map.enabled',
    section: 'Map and places',
    title: 'Map and places',
    description: 'Show where photos were taken.',
    keywords: ['map', 'places', 'location', 'gps', 'countries'],
    key: 'map',
  }),
  photosSwitch({
    id: 'photos.map.remove_location_outside',
    section: 'Map and places',
    title: 'Remove location when sharing outside the home',
    description:
      'Links for people outside the home get photos and videos without GPS. People at home and your own downloads keep it.',
    icon: 'locoff',
    keywords: ['location', 'gps', 'strip', 'privacy', 'share', 'exif', 'links'],
    key: 'removeLocationOutside',
  }),
];

const DUPLICATES: readonly SettingDefinition[] = [
  {
    id: 'photos.duplicates.hashing',
    page: PAGE,
    section: 'Duplicates',
    title: 'Duplicate detection',
    description: 'Hashing is switched on or off in Drive indexing settings.',
    icon: 'copy',
    keywords: ['duplicates', 'hashing', 'indexing', 'checksums'],
    scope: 'server',
    control: 'link',
    visible: ownerOnly,
    href: href.settings.focus(DRIVE_PAGE, 'drive.indexing'),
  },
];

export const SETTINGS: readonly SettingDefinition[] = [
  ...SOURCES,
  ...TIMELINE,
  ...BACKUP,
  ...MEMORIES,
  ...MAP,
  ...DUPLICATES,
];
