import type { MediaHandle, Transport } from './peer-types';

export type PictureSource =
  { readonly kind: 'video'; readonly media: MediaHandle } | { readonly kind: 'server' };

export function pictureSourceOf(
  transport: Transport,
  media: MediaHandle | null,
  videoFrames: boolean,
): PictureSource {
  return videoFrames && transport === 'webrtc' && media !== null
    ? { kind: 'video', media }
    : { kind: 'server' };
}

export function snapshotNameOf(label: string, at: Date): string {
  return `${label}-${at.toISOString().replaceAll(':', '-')}`;
}
