import type { PhoneDetail } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { phoneReadingsOf } from '../phone-values';
import {
  VOLUME_STREAMS,
  callLevel,
  levelOf,
  mediaProgressOf,
  mediaSubtitle,
  mediaTitle,
  outputIcon,
  outputText,
  type PhoneMedia,
} from './sound-model';

type Sound = NonNullable<PhoneDetail['sound']>;

const MEDIA: PhoneMedia = {
  title: 'Everything In Its Right Place',
  artist: 'Radiohead',
  app: 'com.spotify.music',
  appLabel: 'Spotify',
  state: 'playing',
  positionMs: 100_000,
  durationMs: 252_000,
};

function sound(overrides: Partial<Sound> = {}): Sound {
  return {
    streams: { media: 40, ring: 70, alarm: 90, notification: 55, call: 60 },
    output: { kind: 'bluetooth', name: 'Galaxy Buds3' },
    media: MEDIA,
    at: '2026-10-18T10:00:00.000Z',
    ...overrides,
  };
}

const EMPTY = phoneReadingsOf({});

describe('the volume streams of a phone', () => {
  it('lists the four writable streams with the capability each one writes', () => {
    expect(VOLUME_STREAMS.map((spec) => [spec.stream, spec.capability])).toEqual([
      ['media', 'volume'],
      ['ring', 'ring_volume'],
      ['notification', 'notification_volume'],
      ['alarm', 'alarm_volume'],
    ]);
  });

  it('reads a level from the detailed report first', () => {
    const ring = VOLUME_STREAMS.find((spec) => spec.stream === 'ring');
    expect(ring === undefined ? null : levelOf(ring, sound(), EMPTY)).toBe(70);
  });

  it('falls back to the reported value and then to nothing', () => {
    const media = VOLUME_STREAMS.find((spec) => spec.stream === 'media');
    const readings = { ...EMPTY, volumes: { ...EMPTY.volumes, media: 33 } };
    expect(media === undefined ? null : levelOf(media, undefined, readings)).toBe(33);
    expect(media === undefined ? 0 : levelOf(media, undefined, EMPTY)).toBeNull();
  });

  it('shows the call volume only when the phone reported it', () => {
    expect(callLevel(sound())).toBe(60);
    expect(callLevel(undefined)).toBeNull();
  });
});

describe('the audio output', () => {
  it('names the route and the device', () => {
    expect(outputText({ kind: 'bluetooth', name: 'Galaxy Buds3' })).toBe(
      'Galaxy Buds3 · Bluetooth',
    );
    expect(outputText({ kind: 'speaker', name: null })).toBe('Speaker');
    expect(outputText({ kind: 'car', name: '' })).toBe('Car');
  });

  it('draws one icon per route', () => {
    expect(outputIcon('bluetooth')).toBe('bluetooth');
    expect(outputIcon('wired')).toBe('headphones');
  });
});

describe('what is playing', () => {
  it('prefers the reported title and falls back to the value', () => {
    expect(mediaTitle(MEDIA, 'value')).toBe('Everything In Its Right Place');
    expect(mediaTitle({ ...MEDIA, title: null }, 'value')).toBe('value');
    expect(mediaTitle({ ...MEDIA, title: null }, null)).toBeNull();
  });

  it('joins artist and app and skips what is missing', () => {
    expect(mediaSubtitle(MEDIA)).toBe('Radiohead · Spotify');
    expect(mediaSubtitle({ ...MEDIA, artist: null })).toBe('Spotify');
    expect(mediaSubtitle({ ...MEDIA, artist: null, appLabel: '' })).toBeNull();
  });

  it('measures progress as a share of the track', () => {
    const progress = mediaProgressOf(MEDIA);
    expect(progress?.elapsed).toBe('1:40');
    expect(progress?.total).toBe('4:12');
    expect(progress?.share).toBeCloseTo(100 / 252, 5);
    expect(progress?.spoken).toBe('1:40 of 4:12');
  });

  it('has no progress without a position or a length and never passes the end', () => {
    expect(mediaProgressOf({ ...MEDIA, positionMs: null })).toBeNull();
    expect(mediaProgressOf({ ...MEDIA, durationMs: 0 })).toBeNull();
    expect(mediaProgressOf({ ...MEDIA, positionMs: 999_000 })?.share).toBe(1);
  });
});
