import { PHOTO_RECIPE, type PhotoRecipe } from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const COLUMNS = 'item_id, profile_id, recipe, base_version_id, result_sha256, updated_at';

const EDIT_COLUMNS = z.strictObject({
  item_id: z.string(),
  profile_id: z.string(),
  recipe: PHOTO_RECIPE,
  base_version_id: z.string().nullable(),
  result_sha256: z.string(),
  updated_at: z.string(),
});

export interface PhotoEditRow {
  readonly itemId: string;
  readonly profileId: string;
  readonly recipe: PhotoRecipe;
  readonly baseVersionId: string | null;
  readonly resultSha256: string;
  readonly updatedAt: string;
}

const STORED_EDIT = storedRow(
  EDIT_COLUMNS.transform((row): PhotoEditRow => ({
    itemId: row.item_id,
    profileId: row.profile_id,
    recipe: row.recipe,
    baseVersionId: row.base_version_id,
    resultSha256: row.result_sha256,
    updatedAt: row.updated_at,
  })),
  { json: ['recipe'] },
);

export interface PhotoEditContent {
  readonly recipe: PhotoRecipe;
  readonly baseVersionId: string | null;
  readonly resultSha256: string;
}

export class PhotoEditsRepository {
  constructor(private readonly context: StoreContext) {}

  find(itemId: string, profileId: string): PhotoEditRow | undefined {
    return this.context.sql.get(
      STORED_EDIT,
      `select ${COLUMNS} from photo_edits where item_id = $itemId and profile_id = $profileId`,
      { itemId, profileId },
    );
  }

  save(itemId: string, profileId: string, content: PhotoEditContent): PhotoEditRow {
    const { recipe, baseVersionId, resultSha256 } = content;
    return this.context.write(() => {
      this.context.sql.run(
        'save the photo edit recipe',
        `insert into photo_edits (${COLUMNS})
          values ($itemId, $profileId, $recipe, $baseVersionId, $resultSha256, $now)
          on conflict (item_id, profile_id) do update set recipe = excluded.recipe,
            base_version_id = excluded.base_version_id,
            result_sha256 = excluded.result_sha256, updated_at = excluded.updated_at`,
        {
          itemId,
          profileId,
          recipe: jsonText(recipe),
          baseVersionId,
          resultSha256,
          now: this.context.now(),
        },
      );
      return found(this.find(itemId, profileId), 'photo edit', itemId);
    });
  }

  remove(itemId: string, profileId: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'remove the photo edit recipe',
        'delete from photo_edits where item_id = $itemId and profile_id = $profileId',
        { itemId, profileId },
      );
    });
  }
}
