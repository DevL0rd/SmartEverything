import { z } from 'zod';

export const MEDIA_STATUSES = ['playing', 'paused', 'stopped'] as const;

export type MediaStatus = (typeof MEDIA_STATUSES)[number];

const TEXT_LONGEST = 300;

export const SESSION_APP = z.strictObject({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
});

export type SessionApp = z.infer<typeof SESSION_APP>;

export const NOW_PLAYING = z.strictObject({
  player: z.string().min(1).max(100),
  title: z.string().max(TEXT_LONGEST).nullable(),
  artist: z.string().max(TEXT_LONGEST).nullable(),
  status: z.enum(MEDIA_STATUSES),
});

export type NowPlaying = z.infer<typeof NOW_PLAYING>;

export const COMPUTER_SESSION = z.strictObject({
  at: z.iso.datetime({ offset: true }),
  user: z.string().min(1).nullable(),
  locked: z.boolean().nullable(),
  focused: SESSION_APP.nullable(),
  volume: z.number().min(0).max(150).nullable(),
  muted: z.boolean().nullable(),
  media: NOW_PLAYING.nullable(),
});

export type ComputerSessionState = z.infer<typeof COMPUTER_SESSION>;

export function nowPlayingText(media: NowPlaying): string {
  const parts = [media.title, media.artist].filter((part) => part !== null && part !== '');
  return (parts.length === 0 ? media.player : parts.join(' – ')).slice(0, TEXT_LONGEST);
}
