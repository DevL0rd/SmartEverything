import { createElement, type ComponentType } from 'react';
import type { SettingDefinition } from '../../settings/types';
import { IndexingSection } from './settings/page-indexing';
import { GoogleSection } from './settings/page-google';
import { RootsSection } from './settings/page-roots';
import { SharingSection } from './settings/page-sharing';
import { StorageSection } from './settings/page-storage';
import { SyncMountSection } from './settings/page-sync-mount';
import {
  DRIVE_SETTINGS_PAGE,
  DRIVE_SETTINGS_SECTIONS,
  driveSectionVisible,
  type DriveSettingsSectionId,
} from './settings/sections';

const SECTION_COMPONENTS: Readonly<Record<DriveSettingsSectionId, ComponentType>> = {
  roots: RootsSection,
  indexing: IndexingSection,
  sharing: SharingSection,
  storage: StorageSection,
  'sync-mount': SyncMountSection,
  google: GoogleSection,
};

export const SETTINGS: readonly SettingDefinition[] = DRIVE_SETTINGS_SECTIONS.map(
  (section): SettingDefinition => ({
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
  }),
);
