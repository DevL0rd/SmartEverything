import { describe, expect, it } from 'vitest';
import { channelGrid, channelLayout, gridRows, historyRows, membersShown } from './layout';

describe('Talk widget faces', () => {
  it('splits the width into whole channel columns', () => {
    expect(channelGrid(344, 'touch', 6)).toEqual({ columns: 2, itemWidth: 167 });
    expect(channelGrid(252, 'touch', 6)).toEqual({ columns: 1, itemWidth: 250 });
  });

  it('uses the available columns without reserving extra columns for missing channels', () => {
    expect(channelGrid(800, 'pointer', 1)).toEqual({ columns: 1, itemWidth: 798 });
  });

  it('groups channels into rows of the column count so the board can fit whole rows', () => {
    expect(gridRows(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    expect(gridRows(['a'], 3)).toEqual([['a']]);
    expect(gridRows([], 2)).toEqual([]);
  });

  it('reserves the push-to-talk band before fitting the activity line, members and messages', () => {
    expect(channelLayout('M', { width: 344, height: 88, idiom: 'touch' }, 48, true)).toEqual({
      inline: false,
      activityLines: 1,
      members: false,
      memberWidth: 342,
      messages: 0,
    });
    expect(channelLayout('XL', { width: 344, height: 272, idiom: 'touch' }, 48, true)).toEqual({
      inline: false,
      activityLines: 2,
      members: true,
      memberWidth: 342,
      messages: 2,
    });
  });

  it('shows the member strip before a second activity line when only one of them fits', () => {
    const room = 48 + 8 + 20 + 4 + 32;
    expect(
      channelLayout('XL', { width: 344, height: room, idiom: 'touch' }, 48, false),
    ).toMatchObject({ activityLines: 1, members: true, messages: 0 });
    expect(
      channelLayout('XL', { width: 344, height: room + 20, idiom: 'touch' }, 48, false),
    ).toMatchObject({ activityLines: 2, members: true });
  });

  it('puts recent messages beside the channel on a wide card only when a whole row fits', () => {
    expect(channelLayout('W', { width: 600, height: 112, idiom: 'pointer' }, 32, true)).toEqual({
      inline: true,
      activityLines: 1,
      members: true,
      memberWidth: 293,
      messages: 1,
    });
    expect(
      channelLayout('W', { width: 600, height: 95, idiom: 'pointer' }, 32, true),
    ).toMatchObject({ inline: false, messages: 0 });
    expect(
      channelLayout('W', { width: 600, height: 112, idiom: 'pointer' }, 32, false),
    ).toMatchObject({ inline: false, memberWidth: 598, messages: 0 });
  });

  it('fits only whole message rows below the overview', () => {
    const rows = (height: number): number =>
      channelLayout('XL', { width: 344, height, idiom: 'touch' }, 48, true).messages;
    const overview = 48 + 8 + 20 + 4 + 32 + 20 + 12 + 8;
    expect(rows(overview + 47)).toBe(0);
    expect(rows(overview + 48)).toBe(1);
    expect(rows(overview + 48 + 4 + 48)).toBe(2);
  });

  it('keeps older playable audio in a single-row history when the newest message has no audio', () => {
    const latest = { storage_path: null };
    const playable = { storage_path: 'test-tone.ogg' };
    expect(historyRows([latest, playable], 1, true)).toEqual([playable]);
    expect(historyRows([latest], 1, true)).toEqual([latest]);
    expect(historyRows([latest, playable], 2, false)).toEqual([latest, playable]);
  });

  it('reserves space for the remaining member count when avatars run out of room', () => {
    expect(membersShown(3, 104, 'touch')).toBe(3);
    expect(membersShown(9, 128, 'touch')).toBe(2);
    expect(membersShown(108, 156, 'touch')).toBe(3);
  });
});
