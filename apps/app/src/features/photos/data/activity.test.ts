import { describe, expect, it } from 'vitest';
import { OTHER_ROOT_ID, ROOT_ID } from '../../nas/data/fixtures';
import { activityOf } from './activity';

describe('library activity', () => {
  it('is empty when nothing is being read', () => {
    expect(activityOf({})).toBeNull();
  });

  it('adds scan and hash work across roots and ignores scrub', () => {
    expect(
      activityOf({
        [ROOT_ID]: { scan: { done: 2, total: 10 }, hash: { done: 1, total: 5 } },
        [OTHER_ROOT_ID]: { scrub: { done: 9, total: 9 }, hash: { done: 0, total: 4 } },
      }),
    ).toEqual({ done: 3, total: 19 });
  });
});
