import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import type { IconName } from '../../../components/icon';
import { DRIVE_PAGE, type DrivePageId } from '../../../settings/tree-drive';
import type { SettingEnv } from '../../../settings/types';
import type { DriveSection } from '../model/section-routes';
import { COMPUTER_ROWS, HUB_ROWS } from './advanced-rows';
import {
  PUSH_KINDS_CAPTION,
  PUSH_KINDS_SETTING_ID,
  PUSH_KINDS_TITLE,
} from '../notifications/push-kinds';

export const DRIVE_SETTINGS_PAGE = DRIVE_PAGE.root;

export type DriveSettingsSectionId =
  | 'drives'
  | 'sync-mount'
  | 'advanced'
  | 'phone'
  | 'sharing'
  | 'notifications'
  | 'indexing'
  | 'storage';

type SectionEnv = Pick<SettingEnv, 'owner' | 'platform'>;

type Audience = 'everyone' | 'owner' | 'member' | 'desktop' | 'android';

export interface DriveSettingsRowSpec {
  readonly settingId: string;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly audience: Audience;
}

export interface DriveSettingsSectionSpec {
  readonly id: DriveSettingsSectionId;
  readonly page: DrivePageId;
  readonly settingId: string;
  readonly title: string;
  readonly caption: string;
  readonly icon: IconName;
  readonly keywords: readonly string[];
  readonly scope: 'server' | 'device-local';
  readonly audience: Audience;
  readonly rows: readonly DriveSettingsRowSpec[];
}

function row(
  settingId: string,
  title: string,
  keywords: readonly string[],
  audience: Audience = 'everyone',
): DriveSettingsRowSpec {
  return { settingId, title, keywords, audience };
}

const DRIVES: DriveSettingsSectionSpec = {
  id: 'drives',
  page: DRIVE_PAGE.drives,
  settingId: 'drive.drives',
  title: 'Drives',
  caption: 'Your own drive and the Shared Drive for the whole home.',
  icon: 'hardDrive',
  keywords: ['my drive', 'shared drive', 'drives', 'home drive', 'personal drive'],
  scope: 'server',
  audience: 'everyone',
  rows: [
    row('drive.drives.versions', 'Keep earlier versions', [
      'versions',
      'history',
      'older copies',
      'file history',
      'undo changes',
    ]),
    row('drive.drives.hidden', 'Include hidden files', ['hidden', 'dot files', 'dotfiles']),
    row('drive.drives.skip', 'Skip these', [
      'skip patterns',
      'ignore',
      'exclude',
      'leave out',
      'glob',
    ]),
    row('drive.drives.rescan', 'Rescan', ['rescan', 'scan', 'refresh', 'reindex', 'read again']),
  ],
};

function kebab(field: string): string {
  return field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

const ADVANCED: DriveSettingsSectionSpec = {
  id: 'advanced',
  page: DRIVE_PAGE.advanced,
  settingId: 'drive.sync-mount.advanced',
  title: 'Advanced mount settings',
  caption: 'Kernel, cache, upload and connection tuning.',
  icon: 'customize',
  keywords: ['advanced', 'tuning', 'performance', 'speed', 'kernel', 'fuse'],
  scope: 'device-local',
  audience: 'desktop',
  rows: [
    ...COMPUTER_ROWS.map((spec) =>
      row(`drive.sync-mount.advanced.${kebab(spec.field)}`, spec.title, spec.keywords, 'desktop'),
    ),
    ...HUB_ROWS.map((spec) =>
      row(`drive.sync-mount.advanced.hub.${kebab(spec.field)}`, spec.title, spec.keywords, 'owner'),
    ),
  ],
};

const SYNC_MOUNT: DriveSettingsSectionSpec = {
  id: 'sync-mount',
  page: DRIVE_PAGE.mount,
  settingId: 'drive.sync-mount',
  title: 'Mount and cache',
  caption: 'The cache on this computer and advanced mount settings.',
  icon: 'folderSync',
  keywords: ['sync', 'mount', 'network drive', 'file manager', 'offline', 'this computer'],
  scope: 'device-local',
  audience: 'desktop',
  rows: [
    row(
      'drive.sync-mount.mount',
      'Mount My Drive',
      ['mount', 'unmount', 'file manager', 'network drive', 'this computer'],
      'desktop',
    ),
    row(
      'drive.sync-mount.cache-age',
      'Remove unused cache after',
      ['cache age', 'max age', 'evict', 'expire', 'unused files'],
      'desktop',
    ),
    row(
      'drive.sync-mount.cache-size',
      'Largest cache',
      ['cache size', 'cache limit', 'max size', 'disk use'],
      'desktop',
    ),
    row(
      'drive.sync-mount.min-free',
      'Keep disk space free',
      ['free space', 'minimum free', 'disk full', 'reserve'],
      'desktop',
    ),
    row(
      'drive.sync-mount.cleanup',
      'Check the cache every',
      ['cleanup', 'clean up', 'interval', 'how often'],
      'desktop',
    ),
    row(
      'drive.sync-mount.clear-cache',
      'Clear cache',
      ['clear cache', 'empty cache', 'free up space', 'pinned', 'kept offline'],
      'desktop',
    ),
    row(
      'drive.sync-mount.computers',
      'Computers',
      ['computers', 'synced folders', 'placements', 'selective sync'],
      'desktop',
    ),
  ],
};

const PHONE: DriveSettingsSectionSpec = {
  id: 'phone',
  page: DRIVE_PAGE.phone,
  settingId: 'drive.phone',
  title: 'On this phone',
  caption: 'Files kept on this phone and your drives in the Files app.',
  icon: 'smartphone',
  keywords: [
    'offline',
    'offline files',
    'available offline',
    'files app',
    'file picker',
    'documents',
    'this phone',
  ],
  scope: 'device-local',
  audience: 'android',
  rows: [
    row(
      'drive.phone.space',
      'Space used on this phone',
      ['space', 'storage used', 'phone storage', 'kept files'],
      'android',
    ),
    row(
      'drive.phone.remove-all',
      'Remove all offline files',
      ['remove all', 'clear offline', 'free up space', 'delete copies'],
      'android',
    ),
    row(
      'drive.phone.files-app',
      'In the Files app',
      ['files app', 'file picker', 'open with', 'documents provider', 'share sheet'],
      'android',
    ),
  ],
};

const NOTIFICATIONS: DriveSettingsSectionSpec = {
  id: 'notifications',
  page: DRIVE_PAGE.notifications,
  settingId: PUSH_KINDS_SETTING_ID,
  title: 'Notifications',
  caption: PUSH_KINDS_CAPTION,
  icon: 'bell',
  keywords: ['notifications', 'push', 'alerts', 'inbox', 'buzz', 'phone notifications'],
  scope: 'server',
  audience: 'everyone',
  rows: [
    row(`${PUSH_KINDS_SETTING_ID}.push`, PUSH_KINDS_TITLE, [
      'push kinds',
      'shared with you',
      'comments',
      'mentions',
      'access requests',
      'transfers',
      'uploads',
    ]),
  ],
};

const SHARING: DriveSettingsSectionSpec = {
  id: 'sharing',
  page: DRIVE_PAGE.sharing,
  settingId: 'drive.sharing',
  title: 'Sharing',
  caption: 'Who can make links and how long unfinished uploads wait.',
  icon: 'share',
  keywords: ['links', 'share', 'public link'],
  scope: 'server',
  audience: 'owner',
  rows: [
    row(
      'drive.sharing.members-links',
      'Members can make links',
      ['members', 'who can share', 'links', 'outside the home'],
      'owner',
    ),
    row(
      'drive.sharing.upload-expiry',
      'Unfinished uploads',
      ['upload expiry', 'resume upload', 'expire', 'days'],
      'owner',
    ),
  ],
};

const INDEXING: DriveSettingsSectionSpec = {
  id: 'indexing',
  page: DRIVE_PAGE.indexing,
  settingId: 'drive.indexing',
  title: 'Indexing',
  caption: 'How the drives are read and watched for changes.',
  icon: 'search',
  keywords: ['index', 'scan'],
  scope: 'server',
  audience: 'owner',
  rows: [
    row('drive.indexing.pause', 'Pause indexing', ['pause', 'resume', 'stop scanning'], 'owner'),
    row(
      'drive.indexing.duplicates',
      'Find duplicate files',
      ['duplicates', 'hashing', 'copies', 'same file'],
      'owner',
    ),
    row(
      'drive.indexing.contents',
      'Read text inside files',
      ['search inside files', 'content search', 'full text', 'document text'],
      'owner',
    ),
    row(
      'drive.indexing.watcher',
      'Watching for changes',
      ['watcher', 'inotify', 'changes', 'live'],
      'owner',
    ),
  ],
};

const STORAGE: DriveSettingsSectionSpec = {
  id: 'storage',
  page: DRIVE_PAGE.storage,
  settingId: 'drive.storage',
  title: 'Storage',
  caption: 'Space, limits, damage checks and backups.',
  icon: 'server',
  keywords: ['storage', 'space', 'usage'],
  scope: 'server',
  audience: 'everyone',
  rows: [
    row('drive.storage.quotas', 'Space per person', ['quota', 'limit', 'space', 'people'], 'owner'),
    row('drive.storage.mine', 'Your space', ['my space', 'used', 'quota', 'limit'], 'member'),
    row('drive.storage.scrub', 'Check files for damage', [
      'scrub',
      'integrity',
      'damaged',
      'corrupt',
      'bit rot',
    ]),
    row(
      'drive.storage.scrub-schedule',
      'Damage check schedule',
      ['scrub schedule', 'when to check', 'weekly', 'monthly'],
      'owner',
    ),
    row('drive.storage.backup', 'Last backup', ['backup', 'restore', 'last backup']),
    row(
      'drive.storage.backup-report',
      'How a backup reports in',
      ['backup report', 'backup tool', 'report address'],
      'owner',
    ),
  ],
};

export const DRIVE_SETTINGS_SECTIONS: readonly DriveSettingsSectionSpec[] = [
  DRIVES,
  SYNC_MOUNT,
  ADVANCED,
  PHONE,
  SHARING,
  NOTIFICATIONS,
  INDEXING,
  STORAGE,
];

const BY_ID: ReadonlyMap<DriveSettingsSectionId, DriveSettingsSectionSpec> = new Map(
  DRIVE_SETTINGS_SECTIONS.map((section) => [section.id, section]),
);

class UnknownDriveSettingsSectionError extends Error {
  override readonly name = 'UnknownDriveSettingsSectionError';
}

export function driveSettingsSection(id: DriveSettingsSectionId): DriveSettingsSectionSpec {
  const section = BY_ID.get(id);
  if (section === undefined) {
    throw new UnknownDriveSettingsSectionError(`There is no Drive settings section ${id}.`);
  }
  return section;
}

export function audienceSees(audience: Audience, env: SectionEnv): boolean {
  switch (audience) {
    case 'everyone':
      return true;
    case 'owner':
      return env.owner;
    case 'member':
      return !env.owner;
    case 'desktop':
      return env.platform === 'desktop';
    case 'android':
      return env.platform === 'android';
  }
}

export function driveSectionVisible(section: DriveSettingsSectionSpec, env: SectionEnv): boolean {
  return audienceSees(section.audience, env);
}

export function driveRowVisible(
  section: DriveSettingsSectionSpec,
  spec: DriveSettingsRowSpec,
  env: SectionEnv,
): boolean {
  return driveSectionVisible(section, env) && audienceSees(spec.audience, env);
}

export function visibleDriveSettingsSections(env: SectionEnv): readonly DriveSettingsSectionSpec[] {
  return DRIVE_SETTINGS_SECTIONS.filter((section) => driveSectionVisible(section, env));
}

const SECTION_OF_PAGE: Readonly<Partial<Record<DriveSection, DriveSettingsSectionId>>> = {
  index: 'drives',
  'shared-drive': 'drives',
  shared: 'sharing',
  notifications: 'notifications',
  computers: 'sync-mount',
  storage: 'storage',
};

export function driveSettingsSectionFor(
  page: DriveSection,
  env: SectionEnv,
): DriveSettingsSectionId | null {
  const id = SECTION_OF_PAGE[page];
  if (id === undefined) {
    return null;
  }
  return driveSectionVisible(driveSettingsSection(id), env) ? id : null;
}

export function driveSettingsHref(page: DriveSection, env: SectionEnv): AppHref {
  const id = driveSettingsSectionFor(page, env);
  return id === null ? href.settings.page(DRIVE_SETTINGS_PAGE) : driveSettingsFocusHref(id);
}

export function driveSettingsFocusHref(id: DriveSettingsSectionId): AppHref {
  const section = driveSettingsSection(id);
  return href.settings.focus(section.page, section.settingId);
}
