import { describe, expect, it } from 'vitest';
import { photoFlags } from '@smarteverything/domain';
import { fixtureTile } from '../../../components/media-grid/fixtures';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { bytes, count } from '../../../format/number';
import {
  allFavourite,
  endStep,
  feedState,
  feedTiles,
  libraryLine,
  offlineBody,
  pickedText,
  type MonthFeed,
} from './library-model';

function feedOf(tiles: readonly MediaTile[], extra: Partial<MonthFeed> = {}): MonthFeed {
  return { tiles, more: false, loading: false, failed: false, ...extra };
}

const A = fixtureTile(0, 5);
const B = fixtureTile(1, 5);
const C = fixtureTile(2, 5);

describe('library offline note', () => {
  it('says when the shown photos were last loaded', () => {
    expect(offlineBody('14:02')).toBe(
      'Local photos and videos remain available alongside hub photos cached at 14:02. Uploads wait until the hub is back.',
    );
  });

  it('leaves the time out before anything has loaded', () => {
    expect(offlineBody(null)).toBe(
      'Local photos and videos remain available alongside any cached hub photos. Uploads wait until the hub is back.',
    );
  });
});

describe('library library line', () => {
  it('counts every month, the library size and the first year', () => {
    const buckets = [
      { month: '2026-11', count: 48_000 },
      { month: '2014-03', count: 213 },
    ];
    expect(libraryLine(buckets, 698 * 1024 ** 3, 2026)).toBe(
      `${count(48_213)} items · ${bytes(698 * 1024 ** 3)} · 2014 to today`,
    );
  });

  it('leaves out an unknown size and says this year for a new library', () => {
    expect(libraryLine([{ month: '2026-02', count: 1 }], undefined, 2026)).toBe(
      '1 item · this year',
    );
  });

  it('is absent without months', () => {
    expect(libraryLine([], 10, 2026)).toBeNull();
  });
});

describe('library feed', () => {
  it('asks the last month for its next page before opening the next month', () => {
    const feeds = new Map([['2026-11', feedOf([A], { more: true })]]);
    expect(endStep(['2026-11'], feeds, 3)).toBe('fetch');
    feeds.set('2026-11', feedOf([A]));
    expect(endStep(['2026-11'], feeds, 3)).toBe('next');
    expect(endStep(['2026-11'], feeds, 1)).toBe('none');
  });

  it('waits while the last month loads or failed', () => {
    expect(endStep(['2026-11'], new Map(), 2)).toBe('none');
    expect(endStep(['2026-11'], new Map([['2026-11', feedOf([], { loading: true })]]), 2)).toBe(
      'none',
    );
    expect(endStep(['2026-11'], new Map([['2026-11', feedOf([], { failed: true })]]), 2)).toBe(
      'none',
    );
  });

  it('joins the shown months in library order', () => {
    const feeds = new Map([
      ['2026-10', feedOf([C])],
      ['2026-11', feedOf([A, B])],
    ]);
    expect(feedTiles(['2026-11', '2026-10'], feeds)).toEqual([A, B, C]);
    expect(feedTiles(['2026-11'], feeds)).toEqual([A, B]);
  });

  it('names each page state', () => {
    const buckets = [{ month: '2026-11', count: 2 }];
    expect(feedState({ buckets: undefined, bucketsFailed: true, first: undefined })).toBe('error');
    expect(feedState({ buckets: undefined, bucketsFailed: false, first: undefined })).toBe(
      'loading',
    );
    expect(feedState({ buckets: [], bucketsFailed: false, first: undefined })).toBe('empty');
    expect(feedState({ buckets, bucketsFailed: false, first: undefined })).toBe('loading');
    expect(feedState({ buckets, bucketsFailed: false, first: feedOf([], { failed: true }) })).toBe(
      'error',
    );
    expect(feedState({ buckets, bucketsFailed: false, first: feedOf([A], { failed: true }) })).toBe(
      'ready',
    );
  });
});

describe('library selection', () => {
  it('calls a selection favourite only when every picked item is one', () => {
    const loved = { ...A, flags: photoFlags(['favourite']) };
    const plain = { ...B, flags: 0 };
    expect(allFavourite(new Set([loved.id]), [loved, plain])).toBe(true);
    expect(allFavourite(new Set([loved.id, plain.id]), [loved, plain])).toBe(false);
    expect(allFavourite(new Set(), [loved])).toBe(false);
  });

  it('counts the picked items and names the videos among them', () => {
    const clip = { ...A, flags: photoFlags(['video']) };
    const still = { ...B, flags: 0 };
    const other = { ...C, flags: photoFlags(['video']) };
    expect(pickedText(new Set([still.id]), [clip, still, other])).toBe('1 selected');
    expect(pickedText(new Set([clip.id, still.id]), [clip, still, other])).toBe(
      '2 selected · 1 video',
    );
    expect(pickedText(new Set([clip.id, other.id]), [clip, still, other])).toBe(
      '2 selected · 2 videos',
    );
  });
});
