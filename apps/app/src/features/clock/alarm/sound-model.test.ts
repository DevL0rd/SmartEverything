import { PLANNER_ALARM_SOUND, type PlannerRadioResult } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  fileSound,
  isChosen,
  musicItemIdOf,
  musicItemsOf,
  openedCrumbs,
  playlistIdOf,
  crumbKeyOf,
  playlistSound,
  radioDetailOf,
  radioQueryOf,
  radioSound,
  soundTabOf,
  soundTextOf,
  toneLabelOf,
  toneSound,
} from './sound-model';

const SONG = 'a1b2c3d4-0000-4000-8000-000000000051';
const FOLDER = 'a1b2c3d4-0000-4000-8000-000000000052';
const ROOT = 'a1b2c3d4-0000-4000-8000-000000000053';

const STATION: PlannerRadioResult = {
  station_id: 'station-one',
  name: 'Station One',
  url: 'https://stream.example.com/one',
  country: 'Germany',
  bitrate: 128,
  codec: 'MP3',
};

describe('alarm sounds', () => {
  it('builds every kind of sound the hub contract accepts', () => {
    for (const sound of [
      toneSound('default'),
      fileSound(SONG),
      playlistSound(FOLDER, true),
      radioSound(STATION),
    ]) {
      expect(PLANNER_ALARM_SOUND.safeParse(sound).success).toBe(true);
    }
  });

  it('keeps only the station fields an alarm stores', () => {
    expect(radioSound(STATION)).toEqual({
      kind: 'radio',
      station_id: 'station-one',
      name: 'Station One',
      url: 'https://stream.example.com/one',
    });
  });

  it('opens the picker on the tab of the current sound', () => {
    expect(soundTabOf(toneSound('default'))).toBe('tones');
    expect(soundTabOf(fileSound(SONG))).toBe('music');
    expect(soundTabOf(playlistSound(FOLDER, false))).toBe('music');
    expect(soundTabOf(radioSound(STATION))).toBe('radio');
  });

  it('names the system tone, unknown tones, Drive music and stations', () => {
    expect(soundTextOf(toneSound('default'), null)).toBe('System alarm tone');
    expect(toneLabelOf('soft_chime')).toBe('Soft chime');
    expect(soundTextOf(fileSound(SONG), 'Morning.mp3')).toBe('Morning.mp3');
    expect(soundTextOf(fileSound(SONG), null)).toBe('Song from Drive');
    expect(soundTextOf(playlistSound(FOLDER, true), 'Wake up')).toBe('Wake up, shuffled');
    expect(soundTextOf(playlistSound(FOLDER, false), 'Wake up')).toBe('Wake up, in order');
    expect(soundTextOf(radioSound(STATION), null)).toBe('Station One');
  });

  it('marks the chosen sound by what it plays, not by its options', () => {
    expect(isChosen(playlistSound(FOLDER, true), playlistSound(FOLDER, false))).toBe(true);
    expect(isChosen(fileSound(SONG), playlistSound(SONG, false))).toBe(false);
    expect(isChosen(radioSound(STATION), radioSound({ ...STATION, name: 'renamed' }))).toBe(true);
    expect(isChosen(toneSound('default'), toneSound('other'))).toBe(false);
  });

  it('reads the Drive item of music sounds only', () => {
    expect(musicItemIdOf(fileSound(SONG))).toBe(SONG);
    expect(musicItemIdOf(playlistSound(FOLDER, true))).toBe(FOLDER);
    expect(musicItemIdOf(radioSound(STATION))).toBeNull();
  });
});

describe('radio search', () => {
  it('searches only for typed text', () => {
    expect(radioQueryOf('   ')).toBeNull();
    expect(radioQueryOf(' jazz ')).toBe('jazz');
  });

  it('describes a station by country, codec and bitrate when known', () => {
    expect(radioDetailOf(STATION)).toBe('Germany · MP3 · 128 kbps');
    expect(radioDetailOf({ ...STATION, country: null, codec: null, bitrate: null })).toBeNull();
  });
});

describe('Drive music browsing', () => {
  it('shows folders and audio files only', () => {
    const items = [
      { kind: 'folder', name: 'Albums' },
      { kind: 'audio', name: 'Song.mp3' },
      { kind: 'image', name: 'Cover.jpg' },
      { kind: 'document', name: 'Notes.txt' },
    ] as const;
    expect(musicItemsOf(items).map((item) => item.name)).toEqual(['Albums', 'Song.mp3']);
  });

  it('goes one folder deeper on open', () => {
    const start = [{ kind: 'folder', rootId: ROOT, folderId: null, name: 'My Drive' }] as const;
    expect(openedCrumbs(start, { rootId: ROOT, id: FOLDER, name: 'Music' })).toEqual([
      ...start,
      { kind: 'folder', rootId: ROOT, folderId: FOLDER, name: 'Music' },
    ]);
  });

  it('plays an album or a folder as a playlist and keys each crumb apart', () => {
    const album = { kind: 'album', albumId: FOLDER, name: 'Morning' } as const;
    const root = { kind: 'folder', rootId: ROOT, folderId: null, name: 'My Drive' } as const;
    expect(playlistIdOf(album)).toBe(FOLDER);
    expect(playlistIdOf(root)).toBeNull();
    expect(crumbKeyOf(album)).not.toBe(crumbKeyOf({ ...root, folderId: FOLDER }));
  });
});
