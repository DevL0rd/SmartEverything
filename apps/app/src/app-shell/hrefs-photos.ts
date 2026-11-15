import type { PhotoInsightRange } from '@smarteverything/domain';
import type { AppHref } from '../components/app-href';
import type { LibraryTabId, PhotosPage } from '../features/photos/model/library-tabs';

export interface PhotosLibraryParams {
  readonly tab?: Exclude<LibraryTabId, 'all'>;
  readonly q?: string;
}

function photosLibraryQuery(params: PhotosLibraryParams): Readonly<Record<string, string>> {
  return {
    ...(params.tab === undefined ? {} : { tab: params.tab }),
    ...(params.q === undefined || params.q === '' ? {} : { q: params.q }),
  };
}

export const photosHrefs = {
  photos: (params: PhotosLibraryParams = {}): AppHref => {
    const query = photosLibraryQuery(params);
    return Object.keys(query).length === 0 ? '/photos' : { pathname: '/photos', params: query };
  },
  photosPage: (page: PhotosPage, params: Readonly<Record<string, string>> = {}): AppHref => ({
    pathname: `/photos/${page}`,
    params,
  }),
  photosRanking: (
    ranking: 'largest-videos' | 'busiest-days',
    range: PhotoInsightRange,
  ): AppHref => ({ pathname: '/photos/rankings/[ranking]', params: { ranking, range } }),
  photosAlbum: (albumId: string, params: Readonly<Record<string, string>> = {}): AppHref => ({
    pathname: '/photos/albums/[albumId]',
    params: { ...params, albumId },
  }),
  photosPlace: (placeId: string, params: Readonly<Record<string, string>> = {}): AppHref => ({
    pathname: '/photos/places/[placeId]',
    params: { ...params, placeId },
  }),
  photosPerson: (groupId: string): AppHref => ({
    pathname: '/photos/people/[groupId]',
    params: { groupId },
  }),
  photosFolder: (folder: string): AppHref => ({
    pathname: '/photos/folder/[folder]',
    params: { folder },
  }),
  photosItem: (itemId: string, params: Readonly<Record<string, string>> = {}): AppHref => ({
    pathname: '/photos/view/[itemId]',
    params: { ...params, itemId },
  }),
  photosEdit: (itemId: string): AppHref => ({
    pathname: '/photos/view/[itemId]/edit',
    params: { itemId },
  }),
} as const;
