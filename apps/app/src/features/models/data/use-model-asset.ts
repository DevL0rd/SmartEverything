import { API_ENDPOINTS as E, type ModelSpec } from '@smarteverything/domain';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/transport';
import type { StoreState } from '../../../store/state';
import { useEntityStore } from '../../../store/store-context';
import { assetCache } from './asset-cache';
import {
  ASSET_IDLE,
  ASSET_LOADING,
  ModelAssets,
  type HeldAssets,
  type ModelAssetState,
} from './asset-loader';

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const modelAssets = new ModelAssets({
  cache: assetCache,
  fetchBytes: (sha256): Promise<Uint8Array> =>
    api().callBytes(E.readModelAsset, { params: { sha256 } }),
  digest: async (bytes): Promise<string> =>
    hex(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes))),
});

function knownHashes(state: StoreState): ReadonlySet<string> | null {
  return state.loaded ? new Set(state.tables.model_assets.ids) : null;
}

type Settled<T> = Readonly<Record<string, ModelAssetState<T>>>;

const HASH_SEPARATOR = ' ';

function useHeld<T>(
  held: HeldAssets<T>,
  hashes: readonly (string | null)[],
): readonly ModelAssetState<T>[] {
  const store = useEntityStore();
  const [settled, setSettled] = useState<Settled<T>>({});
  const wanted = hashes.filter((hash) => hash !== null).join(HASH_SEPARATOR);
  useEffect(() => {
    const names = wanted === '' ? [] : wanted.split(HASH_SEPARATOR);
    const releases = names.map((sha256) =>
      held.hold(sha256, (state) => {
        setSettled((previous) => ({
          ...Object.fromEntries(Object.entries(previous).filter(([name]) => names.includes(name))),
          [sha256]: state,
        }));
      }),
    );
    modelAssets.pruneOnce(() => knownHashes(store.get()));
    return (): void => {
      for (const release of releases) release();
    };
  }, [held, wanted, store]);
  return useMemo(
    () => hashes.map((hash) => (hash === null ? ASSET_IDLE : (settled[hash] ?? ASSET_LOADING))),
    [hashes, settled],
  );
}

export function useModelSpecs(
  hashes: readonly (string | null)[],
): readonly ModelAssetState<ModelSpec>[] {
  return useHeld(modelAssets.specs, hashes);
}

export function useModelSpec(sha256: string | null): ModelAssetState<ModelSpec> {
  return useModelSpecs([sha256])[0] ?? ASSET_IDLE;
}

export function useModelAssetBytes(sha256: string | null): ModelAssetState<Uint8Array> {
  return useHeld(modelAssets.files, [sha256])[0] ?? ASSET_IDLE;
}
