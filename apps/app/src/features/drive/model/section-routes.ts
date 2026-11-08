export const DRIVE_SECTIONS = [
  'index',
  'recent',
  'starred',
  'shared',
  'activity',
  'sync',
  'computers',
  'storage',
  'trash',
] as const;

export type DriveSection = (typeof DRIVE_SECTIONS)[number];

export const DRIVE_SECTION_ROUTES: readonly DriveSection[] = DRIVE_SECTIONS;
