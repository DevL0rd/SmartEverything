import { describe, expect, it } from 'vitest';
import { embeddedReleaseDate } from './android-release-history';

describe('Android embedded update history position', () => {
  it('uses the immutable embedded manifest date after Expo advances its rollback clock', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const builtAt = '2026-11-06T12:00:00.000Z';
    const rolledBackAt = '2026-11-06T21:00:00.000Z';
    const launch = { updateId: id, commitTime: Date.parse(rolledBackAt) };
    const manifest = { id, commitTime: Date.parse(builtAt) };
    expect(embeddedReleaseDate(manifest, launch.updateId)).toBe(builtAt);
  });

  it('leaves the cutoff unknown when the manifest is not for the running embedded build', () => {
    const running = '00000000-0000-4000-8000-000000000001';
    const other = '00000000-0000-4000-8000-000000000002';
    expect(embeddedReleaseDate({ id: other, commitTime: 1793970829131 }, running)).toBeUndefined();
    expect(embeddedReleaseDate({ id: running }, running)).toBeUndefined();
  });
});
