import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildFieldPatch, mergeFields, resolveLocalDelete, valuesEqual } from '../src';

describe('field patch', () => {
  const base = { summary: 'A', location: 'Here', reminders: { useDefault: true } };

  it('sends only changed fields with If-Match and nulls removed ones', () => {
    const patch = buildFieldPatch({
      etag: '"7"',
      base,
      next: { summary: 'B', reminders: { useDefault: true } },
      fields: ['summary', 'location', 'reminders'],
    });
    expect(patch?.body).toEqual({ summary: 'B', location: null });
    expect(patch?.headers['If-Match']).toBe('"7"');
    expect(patch?.changed).toEqual(['location', 'summary']);
  });

  it('returns nothing when nothing changed and ignores fields it does not model', () => {
    expect(buildFieldPatch({ etag: 'e', base, next: { ...base }, fields: ['summary'] })).toBeNull();
    expect(
      buildFieldPatch({ etag: 'e', base, next: { ...base, attendees: [1] }, fields: ['summary'] }),
    ).toBeNull();
  });

  it('compares nested values regardless of key order', () => {
    expect(valuesEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(valuesEqual([1, 2], [2, 1])).toBe(false);
  });
});

describe('three-way merge', () => {
  const base = { summary: 'A', location: 'L', description: 'D' };

  it('applies changes to different fields from both sides', () => {
    const result = mergeFields({
      base,
      mine: { ...base, summary: 'mine' },
      theirs: { ...base, location: 'theirs' },
      mineUpdatedAt: 1,
      theirsUpdatedAt: 2,
    });
    expect(result.merged).toEqual({ summary: 'mine', location: 'theirs', description: 'D' });
    expect(result.conflicts).toEqual([]);
    expect(result.pushFields).toEqual(['summary']);
  });

  it('sends the newer side on a same-field conflict and records the loser', () => {
    const input = {
      base,
      mine: { ...base, summary: 'mine' },
      theirs: { ...base, summary: 'theirs' },
    };
    const mineNewer = mergeFields({ ...input, mineUpdatedAt: 5, theirsUpdatedAt: 4 });
    expect(mineNewer.merged['summary']).toBe('mine');
    expect(mineNewer.conflicts).toEqual([
      { field: 'summary', winner: 'mine', kept: 'mine', lost: 'theirs' },
    ]);
    expect(mineNewer.pushFields).toEqual(['summary']);
    const theirsNewer = mergeFields({ ...input, mineUpdatedAt: 4, theirsUpdatedAt: 5 });
    expect(theirsNewer.merged['summary']).toBe('theirs');
    expect(theirsNewer.pushFields).toEqual([]);
    expect(theirsNewer.conflicts[0]?.lost).toBe('mine');
  });

  it('treats a field removed on one side as a change', () => {
    const result = mergeFields({
      base,
      mine: { summary: 'A', location: 'L' },
      theirs: base,
      mineUpdatedAt: 1,
      theirsUpdatedAt: 1,
    });
    expect(result.merged).toEqual({ summary: 'A', location: 'L' });
    expect(result.pushFields).toEqual(['description']);
  });

  it('is idempotent: merging the result against itself changes nothing', () => {
    const fieldValue = fc.option(fc.string({ maxLength: 3 }), { nil: undefined });
    const side = fc.record({ a: fieldValue, b: fieldValue, c: fieldValue });
    fc.assert(
      fc.property(
        fc.record({ b: side, m: side, t: side, mu: fc.nat(3), tu: fc.nat(3) }),
        ({ b, m, t, mu, tu }) => {
          const first = mergeFields({
            base: b,
            mine: m,
            theirs: t,
            mineUpdatedAt: mu,
            theirsUpdatedAt: tu,
          });
          const second = mergeFields({
            base: first.merged,
            mine: first.merged,
            theirs: first.merged,
            mineUpdatedAt: mu,
            theirsUpdatedAt: tu,
          });
          expect(valuesEqual(second.merged, first.merged)).toBe(true);
          expect(second.pushFields).toEqual([]);
          for (const conflict of first.conflicts) {
            expect(valuesEqual(conflict.kept, first.merged[conflict.field])).toBe(true);
          }
        },
      ),
    );
  });

  it('keeps every one-sided change from either side', () => {
    const fieldValue = fc.option(fc.string({ maxLength: 3 }), { nil: undefined });
    fc.assert(
      fc.property(fieldValue, fieldValue, fieldValue, (b, m, t) => {
        const result = mergeFields({
          base: { a: b },
          mine: { a: m },
          theirs: { a: t },
          mineUpdatedAt: 1,
          theirsUpdatedAt: 2,
        });
        if (valuesEqual(m, b)) expect(result.merged['a']).toBe(t);
        else if (valuesEqual(t, b)) expect(result.merged['a']).toBe(m);
      }),
    );
  });
});

describe('local delete against remote state', () => {
  it('deletes an unchanged remote, resurrects an edited one and accepts an existing delete', () => {
    expect(resolveLocalDelete({ baseEtag: 'a', remoteEtag: 'a', remoteDeleted: false })).toBe(
      'delete',
    );
    expect(resolveLocalDelete({ baseEtag: 'a', remoteEtag: 'b', remoteDeleted: false })).toBe(
      'resurrect',
    );
    expect(resolveLocalDelete({ baseEtag: 'a', remoteEtag: 'b', remoteDeleted: true })).toBe(
      'already_deleted',
    );
  });
});
