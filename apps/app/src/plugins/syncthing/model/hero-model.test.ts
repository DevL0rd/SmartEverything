import { describe, expect, it } from 'vitest';
import { heroOf, tileLine } from './hero-model';
import { folderOf, peerOf, snapshotOf } from './snapshot-fixture';

const syncing = snapshotOf({
  summary: {
    state: 'syncing',
    needBytes: 1_800_000_000,
    foldersBehind: 2,
    peersOnline: 2,
    peersTotal: 4,
    downloadBytesPerSecond: 4_200_000,
    uploadBytesPerSecond: 600_000,
  },
  folders: [
    folderOf({ id: 'a', completionPercent: 50, needBytes: 100 }),
    folderOf({ id: 'b', completionPercent: 75, needBytes: 100 }),
  ],
  peers: [peerOf()],
});

describe('heroOf', () => {
  it('titles a syncing page "Syncing" and moves the bytes left into the facts', () => {
    const hero = heroOf(syncing);
    expect(hero.title).toBe('Syncing');
    expect(hero.tone).toBe('info');
    expect(hero.facts).toEqual(['1.8 GB left', '2 of 4 devices connected', '2 folders behind']);
    expect(hero.live).toBe(true);
    expect(hero.canAct).toBe(true);
  });

  it('shows the live rates only while syncing with rates live', () => {
    expect(heroOf(syncing).figures).toEqual([
      { label: 'Download', value: '4.2', unit: 'MB/s' },
      { label: 'Upload', value: '600', unit: 'kB/s' },
    ]);
    const quiet = heroOf({ ...syncing, ratesLive: false });
    expect(quiet.figures).toBeUndefined();
    expect(quiet.live).toBe(false);
  });

  it('ties the ring to overall completion and says it in words', () => {
    const hero = heroOf(syncing);
    expect(hero.ratio).toBeCloseTo(1 - 200 / 600, 5);
    expect(hero.ringNote).toBe('66 % of what’s syncing is done');
    expect(hero.spoken).toBe('Syncing, 66 percent complete');
  });

  it('is full and calm when everything is up to date', () => {
    const hero = heroOf(snapshotOf());
    expect(hero).toMatchObject({ title: 'Up to date', tone: 'positive', ratio: 1, live: false });
    expect(hero.facts).toEqual(['1 of 1 device connected', '1 folder']);
    expect(hero.figures).toBeUndefined();
  });

  it('says paused and keeps the actions', () => {
    const hero = heroOf(snapshotOf({ summary: { ...snapshotOf().summary, state: 'paused' } }));
    expect(hero).toMatchObject({ title: 'Paused', tone: 'warning', canAct: true });
    expect(hero.facts).toEqual(['Syncing is paused on this computer']);
  });

  it('counts folders with failed files', () => {
    const one = heroOf(
      snapshotOf({
        summary: { ...snapshotOf().summary, state: 'error' },
        folders: [folderOf({ errorCount: 2 }), folderOf({ id: 'b' })],
      }),
    );
    expect(one.title).toBe('Needs attention');
    expect(one.facts).toEqual(['1 of 1 device connected', '1 folder has failed files']);
    const two = heroOf(
      snapshotOf({
        summary: { ...snapshotOf().summary, state: 'error' },
        folders: [folderOf({ errorCount: 2 }), folderOf({ id: 'b', errorCount: 1 })],
      }),
    );
    expect(two.facts[1]).toBe('2 folders have failed files');
  });

  it('has no ring and a calm word when there are no folders', () => {
    const hero = heroOf(
      snapshotOf({ summary: { ...snapshotOf().summary, state: 'empty' }, folders: [] }),
    );
    expect(hero).toMatchObject({ title: 'No folders yet', tone: 'neutral', ratio: null });
  });

  it('turns neutral, offline and action-free when Syncthing is not reachable', () => {
    const hero = heroOf(
      snapshotOf({
        connection: {
          state: 'unreachable',
          reason: 'timed out',
          since: '2026-10-17T08:00:00+07:00',
        },
        summary: { ...snapshotOf().summary, state: 'offline' },
      }),
    );
    expect(hero.stale).toBe(true);
    expect(hero.tone).toBe('neutral');
    expect(hero.title).toMatch(/^Last reading /);
    expect(hero.facts).toEqual(['Figures are out of date']);
    expect(hero).toMatchObject({ canAct: false, ratio: null, live: false });
    expect(hero.figures).toBeUndefined();
  });

  it('says connecting while it connects', () => {
    const hero = heroOf(snapshotOf({ connection: { state: 'connecting' } }));
    expect(hero.title).toBe('Connecting…');
    expect(hero.stale).toBe(true);
  });
});

describe('tileLine', () => {
  it('shows progress while syncing and the state word otherwise', () => {
    expect(tileLine(syncing)).toBe('Syncing · 66 %');
    expect(tileLine(snapshotOf())).toBe('Up to date');
    expect(tileLine(snapshotOf({ connection: { state: 'connecting' } }))).toBe('Connecting…');
    expect(tileLine(snapshotOf({ connection: { state: 'key_rejected' } }))).toBe('Not connected');
  });
});
