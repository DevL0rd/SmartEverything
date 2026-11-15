import { describe, expect, it } from 'vitest';
import { href } from '../../../app-shell/hrefs';
import { busiestRowOf, rangeParamOf, rankingOf } from './ranking-model';

describe('full ranking lists', () => {
  it('knows the two lists and nothing else', () => {
    expect(rankingOf('largest-videos')).toBe('largest-videos');
    expect(rankingOf('busiest-days')).toBe('busiest-days');
    expect(rankingOf('cameras')).toBeNull();
    expect(rankingOf(undefined)).toBeNull();
  });

  it('keeps the chosen range and falls back to all time', () => {
    expect(rangeParamOf('this_year')).toBe('this_year');
    expect(rangeParamOf('last_12_months')).toBe('last_12_months');
    expect(rangeParamOf('decade')).toBe('all_time');
    expect(rangeParamOf(['this_year'])).toBe('all_time');
  });

  it('opens a list with its range', () => {
    expect(href.photosRanking('largest-videos', 'this_year')).toStrictEqual({
      pathname: '/photos/rankings/[ranking]',
      params: { ranking: 'largest-videos', range: 'this_year' },
    });
  });

  it('words a day and its photo count', () => {
    expect(busiestRowOf({ day: '2025-07-20', items: 1 }).note).toBe('1 photo');
    expect(busiestRowOf({ day: '2025-07-20', items: 1234 }).note).toBe('1,234 photos');
  });
});
