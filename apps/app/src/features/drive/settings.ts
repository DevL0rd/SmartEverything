import { createElement, type ComponentType } from 'react';
import type { SettingDefinition } from '../../settings/types';
import { DrivesSection } from './settings/page-drives';
import { GoogleSection } from './settings/page-google';
import { IndexingSection } from './settings/page-indexing';
import { SharingSection } from './settings/page-sharing';
import { StorageSection } from './settings/page-storage';
import { SyncMountSection } from './settings/page-sync-mount';
import {
  DRIVE_SETTINGS_PAGE,
  DRIVE_SETTINGS_SECTIONS,
  driveRowVisible,
  driveSectionVisible,
  type DriveSettingsSectionId,
  type DriveSettingsSectionSpec,
} from './settings/sections';

const SECTION_COMPONENTS: Readonly<Record<DriveSettingsSectionId, ComponentType>> = {
  drives: DrivesSection,
  'sync-mount': SyncMountSection,
  sharing: SharingSection,
  indexing: IndexingSection,
  storage: StorageSection,
  google: GoogleSection,
};

function sectionSettings(section: DriveSettingsSectionSpec): readonly SettingDefinition[] {
  return [
    {
      id: section.settingId,
      page: DRIVE_SETTINGS_PAGE,
      title: section.title,
      description: section.caption,
      icon: section.icon,
      keywords: section.keywords,
      scope: section.scope,
      control: 'custom',
      visible: (env) => driveSectionVisible(section, env),
      render: () => createElement(SECTION_COMPONENTS[section.id]),
    },
    ...section.rows.map((row): SettingDefinition => ({
      id: row.settingId,
      page: DRIVE_SETTINGS_PAGE,
      title: row.title,
      keywords: row.keywords,
      scope: section.scope,
      control: 'listed',
      in: section.settingId,
      visible: (env) => driveRowVisible(section, row, env),
    })),
  ];
}

export const SETTINGS: readonly SettingDefinition[] =
  DRIVE_SETTINGS_SECTIONS.flatMap(sectionSettings);
