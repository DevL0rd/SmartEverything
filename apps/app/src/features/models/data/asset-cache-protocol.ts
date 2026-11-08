export interface AssetCache {
  readonly read: (sha256: string) => Promise<Uint8Array | null>;
  readonly write: (sha256: string, bytes: Uint8Array) => Promise<void>;
  readonly prune: (keep: ReadonlySet<string>) => Promise<number>;
}
