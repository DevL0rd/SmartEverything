import type { StoreState } from '../../../store/state';
import { FINISH_TOKEN_HASH } from '../../../components/models/three/finish-token-hash';
import { BAKE_THEMES, type BakesInUse } from './bake-protocol';

export function bakesInUse(state: StoreState): BakesInUse | null {
  if (!state.loaded) return null;
  return {
    specHashes: new Set(state.tables.model_assets.ids),
    tokenHashes: new Set([FINISH_TOKEN_HASH]),
    themes: new Set(BAKE_THEMES),
  };
}
