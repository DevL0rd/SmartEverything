import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import type { IconName } from '../../../components/icon';
import type { SettingEnv } from '../../../settings/types';
import type { DriveSection } from '../model/section-routes';

export const DRIVE_SETTINGS_PAGE = 'drive';

export type DriveSettingsSectionId =
  'roots' | 'indexing' | 'sharing' | 'storage' | 'sync-mount' | 'google';

type SectionEnv = Pick<SettingEnv, 'owner' | 'platform'>;

export interface DriveSettingsSectionSpec {
  readonly id: DriveSettingsSectionId;
  readonly settingId: string;
  readonly title: string;
  readonly caption: string;
  readonly icon: IconName;
  readonly keywords: readonly string[];
  readonly scope: 'server' | 'device-local';
  readonly audience: 'everyone' | 'owner' | 'desktop';
}

export const DRIVE_SETTINGS_SECTIONS: readonly DriveSettingsSectionSpec[] = [
  {
    id: 'roots',
    settingId: 'drive.roots',
    title: 'Library folders',
    caption: 'The folders and drives that make up your library.',
    icon: 'folder',
    keywords: ['library', 'folders', 'drives', 'volumes', 'add folder', 'skip patterns', 'hidden'],
    scope: 'server',
    audience: 'everyone',
  },
  {
    id: 'indexing',
    settingId: 'drive.indexing',
    title: 'Indexing',
    caption: 'How the library is scanned and watched for changes.',
    icon: 'search',
    keywords: ['index', 'scan', 'pause', 'duplicates', 'hashing', 'watcher', 'inotify'],
    scope: 'server',
    audience: 'owner',
  },
  {
    id: 'sharing',
    settingId: 'drive.sharing',
    title: 'Sharing',
    caption: 'Who can create links and how long they last.',
    icon: 'share',
    keywords: ['links', 'share', 'expiry', 'expire', 'upload links', 'default link'],
    scope: 'server',
    audience: 'owner',
  },
  {
    id: 'storage',
    settingId: 'drive.storage',
    title: 'Storage',
    caption: 'Space, quotas, integrity checks and backups.',
    icon: 'server',
    keywords: ['quota', 'space', 'scrub', 'backup', 'restore drill', 'usage', 'integrity'],
    scope: 'server',
    audience: 'everyone',
  },
  {
    id: 'sync-mount',
    settingId: 'drive.sync-mount',
    title: 'Sync and mount',
    caption: 'Keep folders in sync with this computer and mount the drive.',
    icon: 'folderSync',
    keywords: ['sync', 'mount', 'selective sync', 'offline', 'pins', 'cache', 'local folder'],
    scope: 'device-local',
    audience: 'desktop',
  },
  {
    id: 'google',
    settingId: 'drive.google',
    title: 'Import from Google',
    caption: 'Copy your data from Google once. Nothing stays linked.',
    icon: 'download',
    keywords: ['google', 'import', 'copy', 'takeout', 'migrate'],
    scope: 'server',
    audience: 'owner',
  },
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

export function driveSectionVisible(section: DriveSettingsSectionSpec, env: SectionEnv): boolean {
  switch (section.audience) {
    case 'everyone':
      return true;
    case 'owner':
      return env.owner;
    case 'desktop':
      return env.platform === 'desktop';
  }
}

export function visibleDriveSettingsSections(env: SectionEnv): readonly DriveSettingsSectionSpec[] {
  return DRIVE_SETTINGS_SECTIONS.filter((section) => driveSectionVisible(section, env));
}

const SECTION_OF_PAGE: Readonly<Partial<Record<DriveSection, DriveSettingsSectionId>>> = {
  shared: 'sharing',
  sync: 'sync-mount',
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
  return id === null
    ? href.settings.page(DRIVE_SETTINGS_PAGE)
    : href.settings.focus(DRIVE_SETTINGS_PAGE, driveSettingsSection(id).settingId);
}
