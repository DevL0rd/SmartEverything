import { describe, expect, it } from 'vitest';
import { emptyState, makeTable, type RowOf } from '../../../store/state';
import { FINISH_TOKEN_HASH } from '../../../components/models/three/finish-token-hash';
import { bakesInUse } from './bakes-in-use';

describe('bakes in use', () => {
  it('is unknown until the home has loaded', () => {
    expect(bakesInUse(emptyState())).toBeNull();
  });

  it('keeps every known model asset, the current finish tokens and both themes', () => {
    const empty = emptyState();
    const state = {
      ...empty,
      loaded: true,
      tables: {
        ...empty.tables,
        model_assets: makeTable<RowOf<'model_assets'>>({}, ['spec-a', 'spec-b'], 1),
      },
    };
    expect(bakesInUse(state)).toEqual({
      specHashes: new Set(['spec-a', 'spec-b']),
      tokenHashes: new Set([FINISH_TOKEN_HASH]),
      themes: new Set(['light', 'dark']),
    });
  });
});
