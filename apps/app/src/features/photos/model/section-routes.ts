export const PHOTOS_SECTIONS = [
  'index',
  'search',
  'memories',
  'albums/index',
  'map',
  'favourites',
  'videos',
  'screenshots',
  'cameras',
  'ai',
  'duplicates',
  'backup',
  'insights',
  'deleted',
] as const;

export type PhotosSection = (typeof PHOTOS_SECTIONS)[number];

export const PHOTOS_SECTION_ROUTES: readonly PhotosSection[] = PHOTOS_SECTIONS;
