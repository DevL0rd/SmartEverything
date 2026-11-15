import { z } from 'zod';
import type { StoreContext } from '../context';
import { inList } from '../sql';

const COLUMNS = 'item_id, rev, model, dims, scale, vector';

const EMBEDDING_COLUMNS = z.strictObject({
  item_id: z.string(),
  rev: z.number(),
  model: z.string(),
  dims: z.number(),
  scale: z.number(),
  vector: z.instanceof(Uint8Array),
});

export interface PhotoEmbedding {
  readonly itemId: string;
  readonly rev: number;
  readonly model: string;
  readonly dims: number;
  readonly scale: number;
  readonly vector: Uint8Array;
}

const STORED_EMBEDDING = EMBEDDING_COLUMNS.transform((row): PhotoEmbedding => ({
  itemId: row.item_id,
  rev: row.rev,
  model: row.model,
  dims: row.dims,
  scale: row.scale,
  vector: row.vector,
}));

export class PhotoEmbeddingsRepository {
  constructor(private readonly context: StoreContext) {}

  find(itemId: string): PhotoEmbedding | undefined {
    return this.context.sql.get(
      STORED_EMBEDDING,
      `select ${COLUMNS} from photo_embeddings where item_id = $itemId`,
      { itemId },
    );
  }

  after(itemId: string | null, size: number): PhotoEmbedding[] {
    return this.context.sql.all(
      STORED_EMBEDDING,
      `select ${COLUMNS} from photo_embeddings where item_id > $after order by item_id limit $size`,
      { after: itemId ?? '', size },
    );
  }

  forItems(itemIds: readonly string[]): PhotoEmbedding[] {
    const filter = inList('item_id', 'ids', itemIds);
    return this.context.sql.all(
      STORED_EMBEDDING,
      `select ${COLUMNS} from photo_embeddings where ${filter.text} order by item_id`,
      filter.parameters,
    );
  }

  save(embedding: PhotoEmbedding): void {
    this.context.write(() => {
      this.context.sql.run(
        'save the photo embedding',
        `insert into photo_embeddings (${COLUMNS})
          values ($itemId, $rev, $model, $dims, $scale, $vector)
          on conflict (item_id) do update set rev = excluded.rev, model = excluded.model,
            dims = excluded.dims, scale = excluded.scale, vector = excluded.vector`,
        {
          itemId: embedding.itemId,
          rev: embedding.rev,
          model: embedding.model,
          dims: embedding.dims,
          scale: embedding.scale,
          vector: embedding.vector,
        },
      );
    });
  }

  remove(itemId: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'remove the photo embedding',
        'delete from photo_embeddings where item_id = $itemId',
        { itemId },
      );
    });
  }

  removeAll(): number {
    return this.context.write(() =>
      this.context.sql.run('remove every photo embedding', 'delete from photo_embeddings'),
    );
  }
}
