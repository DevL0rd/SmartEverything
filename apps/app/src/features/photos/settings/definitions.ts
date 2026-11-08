import { createElement, type ComponentType } from 'react';
import type { SettingDefinition, SettingEnv } from '../../../settings/types';
import { SETTINGS } from '../settings';
import { BackupAlbumsRow } from './backup-albums';
import { ExcludedAlbumsRow } from './excluded-albums';
import { MapAttributionRow } from './map-attribution';
import { BackupFolderRow, FreeUpRow, OriginalQualityRow, ThisPhoneRow } from './phone-rows';
import { PhonesCard } from './phones-card';

const PAGE = 'photos';

const PHONE_SECTION = 'Backup on this device';
const localDevice = (env: SettingEnv): boolean => env.platform !== 'web';

const onAndroid = (env: SettingEnv): boolean => env.platform === 'android';
const offAndroid = (env: SettingEnv): boolean => env.platform !== 'android';

interface RowSpec {
  readonly id: string;
  readonly section: string;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly scope: SettingDefinition['scope'];
  readonly visible?: (env: SettingEnv) => boolean;
  readonly row?: boolean;
  readonly component: ComponentType;
}

function row(spec: RowSpec): SettingDefinition {
  return {
    id: spec.id,
    page: PAGE,
    section: spec.section,
    title: spec.title,
    keywords: spec.keywords,
    scope: spec.scope,
    ...(spec.visible === undefined ? {} : { visible: spec.visible }),
    control: 'custom',
    row: spec.row ?? true,
    render: () => createElement(spec.component),
  };
}

const phoneRow = (spec: Omit<RowSpec, 'section' | 'scope'>): SettingDefinition =>
  row({ section: PHONE_SECTION, scope: 'device', visible: localDevice, ...spec });

export const PHONE_BACKUP_ROWS: readonly SettingDefinition[] = [
  phoneRow({
    id: 'photos.backup.status',
    title: 'This device',
    keywords: ['backup status', 'backing up', 'up to date', 'waiting', 'paused'],
    component: ThisPhoneRow,
  }),
  phoneRow({
    id: 'photos.backup.albums',
    title: 'Albums and folders',
    keywords: ['albums', 'folders', 'camera roll', 'backup'],
    component: BackupAlbumsRow,
    visible: onAndroid,
  }),
  phoneRow({
    id: 'photos.backup.original',
    title: 'Original quality',
    keywords: ['quality', 'original', 'compression', 'full resolution', 'backup'],
    component: OriginalQualityRow,
  }),
  phoneRow({
    id: 'photos.backup.folder',
    title: 'Backup folder',
    keywords: ['folder', 'camera roll', 'where', 'path', 'backup'],
    component: BackupFolderRow,
  }),
  phoneRow({
    id: 'photos.backup.free_up',
    title: 'Free up space',
    keywords: ['free up space', 'storage', 'remove from phone', 'delete local copies'],
    component: FreeUpRow,
    visible: onAndroid,
  }),
];

export const PHONES_BACKUP_BLOCK: readonly SettingDefinition[] = [
  row({
    id: 'photos.phones',
    section: 'Backup',
    title: 'Phone backup',
    keywords: ['backup', 'phones', 'camera roll', 'backup folder', 'each phone'],
    scope: 'server',
    visible: offAndroid,
    row: false,
    component: PhonesCard,
  }),
];

export const MEMORY_ROWS: readonly SettingDefinition[] = [
  row({
    id: 'photos.memories.excluded',
    section: 'Memories',
    title: 'Leave out of memories',
    keywords: ['exclude', 'leave out', 'hide', 'albums', 'memories'],
    scope: 'server',
    component: ExcludedAlbumsRow,
  }),
];

export const MAP_ROWS: readonly SettingDefinition[] = [
  row({
    id: 'photos.map.attribution',
    section: 'Map and places',
    title: 'Map data',
    keywords: ['attribution', 'geonames', 'natural earth', 'map data', 'licence'],
    scope: 'server',
    component: MapAttributionRow,
  }),
];

export const PHOTOS_SECTION_ORDER = [
  'Sources',
  'Timeline',
  'Backup on this device',
  'Backup',
  'Memories',
  'Map and places',
  'Duplicates',
] as const;

export function photosPageSettings(
  base: readonly SettingDefinition[],
): readonly SettingDefinition[] {
  const all = [...base, ...PHONE_BACKUP_ROWS, ...PHONES_BACKUP_BLOCK, ...MEMORY_ROWS, ...MAP_ROWS];
  return PHOTOS_SECTION_ORDER.flatMap((section) =>
    all.filter((setting) => setting.section === section),
  );
}

export const PHOTOS_SETTINGS: readonly SettingDefinition[] = photosPageSettings(SETTINGS);
