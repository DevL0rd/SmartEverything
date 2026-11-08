import type * as MediaLibraryModule from 'expo-media-library';
import { z } from 'zod';
import { compareText } from '../../../format/text';

export const PHONE_ALBUM = z
  .object({ id: z.string().min(1), title: z.string() })
  .strict()
  .readonly();

export type PhoneAlbum = z.infer<typeof PHONE_ALBUM>;

export const PHONE_ALBUMS_KEY = ['window', 'photos-phone-albums'] as const;

let loaded: Promise<typeof MediaLibraryModule> | null = null;

function library(): Promise<typeof MediaLibraryModule> {
  loaded ??= import('expo-media-library');
  return loaded;
}

function byTitle(a: PhoneAlbum, b: PhoneAlbum): number {
  return compareText(a.title, b.title);
}

export async function listPhoneAlbums(): Promise<readonly PhoneAlbum[]> {
  const lib = await library();
  const albums = await lib.Album.getAll();
  const titled = await Promise.all(
    albums.map(async (album) => PHONE_ALBUM.parse({ id: album.id, title: await album.getTitle() })),
  );
  return titled.sort(byTitle);
}
