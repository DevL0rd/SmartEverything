import { createHash } from 'node:crypto';
import { TABLE_ROWS, type TableRow } from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';

export type ModelAssetRow = TableRow<'model_assets'>;

export type ModelAssetKind = ModelAssetRow['kind'];

export type ModelAssetOwner = ModelAssetRow['owner'];

export interface NewModelAsset {
  readonly kind: ModelAssetKind;
  readonly owner: ModelAssetOwner;
  readonly bytes: Uint8Array;
}

export interface GlbLodLink {
  readonly level: 0 | 1 | 2;
  readonly bytes: Uint8Array;
}

export interface GlbLodRow {
  readonly level: 0 | 1 | 2;
  readonly sha256: string;
}

export interface ModelAssetBytes {
  readonly kind: ModelAssetKind;
  readonly size: number;
  readonly bytes: Uint8Array;
}

class ModelAssetKindError extends Error {
  override readonly name = 'ModelAssetKindError';

  constructor(sha256: string, stored: ModelAssetKind, given: ModelAssetKind) {
    super(`The model asset ${sha256} is already stored as ${stored}, not ${given}.`);
  }
}

const ROW = TABLE_ROWS.model_assets;

const BYTES = z.object({
  kind: ROW.shape.kind,
  size: ROW.shape.size,
  bytes: z.instanceof(Uint8Array),
});

const LOD_ROW = z.object({
  level: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  sha256: ROW.shape.sha256,
});

const COLUMNS = 'sha256, kind, size, owner, created';

const REFERENCED = `exists (select 1 from model_catalog where spec_sha256 = $sha256)
  or exists (select 1 from model_overrides where asset_hash = $sha256)
  or exists (select 1 from glb_lods where lod_sha256 = $sha256 and source_sha256 <> $sha256)`;

export function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export class ModelAssetsRepository {
  constructor(private readonly context: StoreContext) {}

  save(asset: NewModelAsset): ModelAssetRow {
    return this.context.write(() => {
      const sha256 = sha256Of(asset.bytes);
      const stored = this.find(sha256);
      if (stored !== undefined) {
        if (stored.kind !== asset.kind)
          throw new ModelAssetKindError(sha256, stored.kind, asset.kind);
        return stored;
      }
      const row = ROW.parse({
        sha256,
        kind: asset.kind,
        size: asset.bytes.byteLength,
        owner: asset.owner,
        created: this.context.now(),
      });
      this.context.sql.run(
        'store the model asset',
        `insert into model_assets (${COLUMNS}, bytes)
         values ($sha256, $kind, $size, $owner, $created, $bytes)`,
        { ...row, bytes: asset.bytes },
      );
      this.context.changed('model_assets', 'INSERT', row, null);
      return row;
    });
  }

  saveGlb(asset: NewModelAsset, levels: readonly GlbLodLink[]): ModelAssetRow {
    return this.context.write(() => {
      const row = this.save(asset);
      for (const level of levels) {
        const lod = this.save({ kind: 'glb', owner: asset.owner, bytes: level.bytes });
        this.context.sql.run(
          'link the decimated model level to its source',
          `insert or replace into glb_lods (source_sha256, level, lod_sha256)
           values ($source, $level, $lod)`,
          { source: row.sha256, level: level.level, lod: lod.sha256 },
        );
      }
      return row;
    });
  }

  lodsOf(source: string): GlbLodRow[] {
    return this.context.sql.all(
      LOD_ROW,
      'select level, lod_sha256 as sha256 from glb_lods where source_sha256 = $source order by level',
      { source },
    );
  }

  find(sha256: string): ModelAssetRow | undefined {
    return this.context.sql.get(ROW, `select ${COLUMNS} from model_assets where sha256 = $sha256`, {
      sha256,
    });
  }

  bytes(sha256: string): ModelAssetBytes | undefined {
    return this.context.sql.get(
      BYTES,
      'select kind, size, bytes from model_assets where sha256 = $sha256',
      { sha256 },
    );
  }

  all(): ModelAssetRow[] {
    return this.context.sql.all(
      ROW,
      `select ${COLUMNS} from model_assets order by created, sha256`,
    );
  }

  release(hashes: readonly string[]): number {
    return this.context.write(() => {
      let released = 0;
      for (const sha256 of new Set(hashes)) {
        const row = this.find(sha256);
        if (row === undefined || this.referenced(sha256)) continue;
        this.context.sql.run(
          'release the model asset nothing uses',
          'delete from model_assets where sha256 = $sha256',
          { sha256 },
        );
        this.context.changed('model_assets', 'DELETE', null, row);
        released += 1;
      }
      return released;
    });
  }

  private referenced(sha256: string): boolean {
    return (
      this.context.sql.get(z.object({ used: z.int() }), `select (${REFERENCED}) as used`, {
        sha256,
      })?.used === 1
    );
  }
}
