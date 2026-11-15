export const PHOTOS_SECTIONS = [
  'index',
  'people',
  'albums/index',
  'sharing',
  'map',
  'folders',
  'insights',
  'archive',
  'locked',
  'deleted',
] as const;

export type PhotosSection = (typeof PHOTOS_SECTIONS)[number];

export const PHOTOS_SECTION_ROUTES: readonly PhotosSection[] = PHOTOS_SECTIONS;
