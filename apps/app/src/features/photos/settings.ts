import { createElement, type ComponentType } from 'react';
import {
  PHOTOS_GROUPINGS,
  PHOTOS_ZOOMS,
  type PhotosBackupPref,
  type PhotosPref,
} from '@smarteverything/domain';
import { changeBackupEnabled } from './backup/activation';
import { BackupAlbumsRow } from './settings/backup-albums';
import { MapAttributionRow } from './settings/map-attribution';
import { BackupFolderRow, OriginalQualityRow } from './settings/phone-rows';
import { href } from '../../app-shell/hrefs';
import type { IconName } from '../../components/icon';
import type { SettingContext, SettingDefinition, SettingEnv } from '../../settings/types';
import { PREFS, prefValueOf, savePref } from '../../store/prefs';
import type { StoreState } from '../../store/state';

export const PHOTOS_PAGE = 'photos';
export const PHOTOS_BACKUP_PAGE = 'photos/backup';
export const PHOTOS_DUPLICATES_PAGE = 'photos/duplicates';

const LIBRARY = 'Library';
const SOURCES = 'Sources';
const MAP = 'Map and places';
const THIS_DEVICE = 'This device';
const DETECTION = 'Duplicate detection';

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
const onAndroid = (env: SettingEnv): boolean => env.platform === 'android';
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

type SwitchKey<T> = { readonly [K in keyof T]: T[K] extends boolean ? K : never }[keyof T];

interface SwitchSpec<T> {
  readonly id: string;
  readonly section: string;
  readonly title: string;
  readonly description?: string;
  readonly icon?: IconName;
  readonly keywords: readonly string[];
  readonly key: SwitchKey<T>;
}

function photosSwitch(spec: SwitchSpec<PhotosPref>): SettingDefinition {
  const { key } = spec;
  return {
    id: spec.id,
    page: PHOTOS_PAGE,
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

function backupSwitch(spec: Omit<SwitchSpec<PhotosBackupPref>, 'section'>): SettingDefinition {
  const { key } = spec;
  return {
    id: spec.id,
    page: PHOTOS_BACKUP_PAGE,
    section: THIS_DEVICE,
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

interface RowSpec {
  readonly id: string;
  readonly page: string;
  readonly section: string;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly scope: SettingDefinition['scope'];
  readonly visible?: (env: SettingEnv) => boolean;
  readonly component: ComponentType;
}

function customRow(spec: RowSpec): SettingDefinition {
  return {
    id: spec.id,
    page: spec.page,
    section: spec.section,
    title: spec.title,
    keywords: spec.keywords,
    scope: spec.scope,
    ...(spec.visible === undefined ? {} : { visible: spec.visible }),
    control: 'custom',
    row: true,
    render: () => createElement(spec.component),
  };
}

const LIBRARY_SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'photos.library.zoom',
    page: PHOTOS_PAGE,
    section: LIBRARY,
    title: 'Opens at',
    keywords: ['zoom', 'years', 'months', 'days', 'comfortable', 'library'],
    scope: 'server',
    control: 'select',
    inline: true,
    options: PHOTOS_ZOOMS.map((value) => ({ value, label: ZOOM_LABELS[value] })),
    read: (state) => photosOf(state).libraryZoom,
    write: (value, context): Promise<void> => {
      const zoom = PHOTOS_ZOOMS.find((candidate) => candidate === value);
      return zoom === undefined ? Promise.resolve() : savePhotos(context, { libraryZoom: zoom });
    },
  },
  {
    id: 'photos.library.group',
    page: PHOTOS_PAGE,
    section: LIBRARY,
    title: 'Group by',
    keywords: ['group', 'day', 'month', 'library'],
    scope: 'server',
    control: 'select',
    inline: true,
    options: PHOTOS_GROUPINGS.map((value) => ({ value, label: GROUP_LABELS[value] })),
    read: (state) => photosOf(state).libraryGroup,
    write: (value, context): Promise<void> => {
      const group = PHOTOS_GROUPINGS.find((candidate) => candidate === value);
      return group === undefined ? Promise.resolve() : savePhotos(context, { libraryGroup: group });
    },
  },
  photosSwitch({
    id: 'photos.library.videos',
    section: LIBRARY,
    title: 'Show videos',
    keywords: ['videos', 'library'],
    key: 'showVideos',
  }),
  photosSwitch({
    id: 'photos.library.not_backed_up',
    section: LIBRARY,
    title: 'Show items not backed up',
    description: 'Show photos that are still only on this device, marked as not backed up.',
    keywords: ['not backed up', 'only on this device', 'library'],
    key: 'showNotBackedUp',
  }),
];

const SOURCE_SETTINGS: readonly SettingDefinition[] = [
  photosSwitch({
    id: 'photos.sources.cameras',
    section: SOURCES,
    title: 'Cameras',
    description: 'Show camera recordings and snapshots in Photos.',
    keywords: ['cameras', 'snapshots', 'recordings', 'sources'],
    key: 'showCameras',
  }),
  photosSwitch({
    id: 'photos.sources.ai',
    section: SOURCES,
    title: 'Made with AI',
    description: 'Show images made by the assistant in Photos.',
    keywords: ['ai', 'generated', 'assistant', 'images', 'sources'],
    key: 'showAi',
  }),
];

const MAP_SETTINGS: readonly SettingDefinition[] = [
  photosSwitch({
    id: 'photos.map.enabled',
    section: MAP,
    title: 'Map and places',
    description: 'Show where photos were taken.',
    keywords: ['map', 'places', 'location', 'gps', 'countries'],
    key: 'map',
  }),
  photosSwitch({
    id: 'photos.map.remove_location_outside',
    section: MAP,
    title: 'Remove location when sharing outside the home',
    description:
      'Links for people outside the home get photos and videos without GPS. People at home and your own downloads keep it.',
    icon: 'locoff',
    keywords: ['location', 'gps', 'strip', 'privacy', 'share', 'exif', 'links'],
    key: 'removeLocationOutside',
  }),
  customRow({
    id: 'photos.map.attribution',
    page: PHOTOS_PAGE,
    section: MAP,
    title: 'Map data',
    keywords: ['attribution', 'geonames', 'natural earth', 'map data', 'licence'],
    scope: 'server',
    component: MapAttributionRow,
  }),
];

const deviceRow = (spec: Omit<RowSpec, 'page' | 'section' | 'scope'>): SettingDefinition =>
  customRow({
    page: PHOTOS_BACKUP_PAGE,
    section: THIS_DEVICE,
    scope: 'device',
    visible: localDevice,
    ...spec,
  });

const BACKUP_SETTINGS: readonly SettingDefinition[] = [
  backupSwitch({
    id: 'photos.backup.enabled',
    title: 'Back up this device',
    description: 'Copy this device’s photos and videos to Photos in your drive as originals.',
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
  deviceRow({
    id: 'photos.backup.albums',
    title: 'Albums and folders',
    keywords: ['albums', 'folders', 'camera roll', 'backup'],
    component: BackupAlbumsRow,
    visible: onAndroid,
  }),
  deviceRow({
    id: 'photos.backup.original',
    title: 'Original quality',
    keywords: ['quality', 'original', 'compression', 'full resolution', 'backup'],
    component: OriginalQualityRow,
  }),
  deviceRow({
    id: 'photos.backup.folder',
    title: 'Backup folder',
    keywords: ['folder', 'camera roll', 'where', 'path', 'backup', 'my drive'],
    component: BackupFolderRow,
  }),
];

const DUPLICATE_SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'photos.duplicates.hashing',
    page: PHOTOS_DUPLICATES_PAGE,
    section: DETECTION,
    title: 'Duplicate detection',
    description: 'Hashing is switched on or off in Drive indexing settings.',
    icon: 'copy',
    keywords: ['duplicates', 'hashing', 'indexing', 'checksums'],
    scope: 'server',
    control: 'link',
    visible: ownerOnly,
    href: href.settings.focus('drive', 'drive.indexing'),
  },
];

export const PHOTOS_SETTINGS: readonly SettingDefinition[] = [
  ...LIBRARY_SETTINGS,
  ...SOURCE_SETTINGS,
  ...MAP_SETTINGS,
  ...BACKUP_SETTINGS,
  ...DUPLICATE_SETTINGS,
];
