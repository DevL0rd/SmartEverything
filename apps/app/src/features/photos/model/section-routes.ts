export const PHOTOS_SECTIONS = ['index', 'albums/index', 'map', 'insights', 'deleted'] as const;

export type PhotosSection = (typeof PHOTOS_SECTIONS)[number];

export const PHOTOS_SECTION_ROUTES: readonly PhotosSection[] = PHOTOS_SECTIONS;
