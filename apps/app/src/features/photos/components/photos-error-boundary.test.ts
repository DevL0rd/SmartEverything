import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-router', () => ({ usePathname: (): string => '/photos' }));
vi.mock('../../../app-shell/route-error-boundary', () => ({
  AreaRouteErrorBoundary: (): null => null,
}));
vi.mock('../data', () => ({
  usePhotoRailCounts: (): { data: undefined } => ({ data: undefined }),
}));
vi.mock('./photos-frame', () => ({
  PHOTOS_RAIL_IDS: ['library', 'albums', 'map', 'folders'],
  PHOTOS_RAIL_HREF: {
    library: '/photos',
    albums: { pathname: '/photos/albums', params: {} },
    map: { pathname: '/photos/map', params: {} },
    folders: { pathname: '/photos/folders', params: {} },
  },
  photosSectionsOf: (): null => null,
  photosTitleOf: (): string => 'Photos',
}));

const { photosCrashPlaceOf } = await import('./photos-error-boundary');

describe('photos crash place', () => {
  it('keeps a crashed section root on its own rail item without a back arrow', () => {
    expect(photosCrashPlaceOf('/photos')).toEqual({ active: 'library', root: true });
    expect(photosCrashPlaceOf('/photos/albums/')).toEqual({ active: 'albums', root: true });
  });

  it('gives a crashed detail page its parent section and a back arrow', () => {
    expect(photosCrashPlaceOf('/photos/albums/a1')).toEqual({ active: 'albums', root: false });
    expect(photosCrashPlaceOf('/photos/places/7')).toEqual({ active: 'map', root: false });
    expect(photosCrashPlaceOf('/photos/view/x/edit')).toEqual({ active: 'library', root: false });
  });

  it('names a path outside Photos', () => {
    expect(() => photosCrashPlaceOf('/drive')).toThrow('Photos has no section for /drive');
  });
});
