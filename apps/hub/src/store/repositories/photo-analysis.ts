import {
  PHOTO_ANALYSIS_STATES,
  PHOTO_BOX,
  PHOTO_LABEL,
  type PhotoAnalysisState,
  type PhotoBox,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';
import { inList, jsonText } from '../sql';

const COLUMNS = 'item_id, rev, model, state, caption, scene, labels, pets, error, analysed_at';

const PET = z.strictObject({ species: z.string().min(1), box: PHOTO_BOX });

const ANALYSIS_COLUMNS = z.strictObject({
  item_id: z.string(),
  rev: z.number(),
  model: z.string(),
  state: z.enum(PHOTO_ANALYSIS_STATES),
  caption: z.string().nullable(),
  scene: z.string().nullable(),
  labels: z.array(PHOTO_LABEL),
  pets: z.array(PET),
  error: z.string().nullable(),
  analysed_at: z.string(),
});

export interface PhotoPet {
  readonly species: string;
  readonly box: PhotoBox;
}

export interface PhotoAnalysisRow {
  readonly itemId: string;
  readonly rev: number;
  readonly model: string;
  readonly state: PhotoAnalysisState;
  readonly caption: string | null;
  readonly scene: string | null;
  readonly labels: readonly string[];
  readonly pets: readonly PhotoPet[];
  readonly error: string | null;
  readonly analysedAt: string;
}

const STORED_ANALYSIS = storedRow(
  ANALYSIS_COLUMNS.transform((row): PhotoAnalysisRow => ({
    itemId: row.item_id,
    rev: row.rev,
    model: row.model,
    state: row.state,
    caption: row.caption,
    scene: row.scene,
    labels: row.labels,
    pets: row.pets,
    error: row.error,
    analysedAt: row.analysed_at,
  })),
  { json: ['labels', 'pets'] },
);

const STATE_COUNT = z.strictObject({ state: z.enum(PHOTO_ANALYSIS_STATES), total: z.number() });

export type PhotoAnalysisWrite = Omit<PhotoAnalysisRow, 'analysedAt'>;

export class PhotoAnalysisRepository {
  constructor(private readonly context: StoreContext) {}

  find(itemId: string): PhotoAnalysisRow | undefined {
    return this.context.sql.get(
      STORED_ANALYSIS,
      `select ${COLUMNS} from photo_analysis where item_id = $itemId`,
      { itemId },
    );
  }

  forItems(itemIds: readonly string[]): PhotoAnalysisRow[] {
    const filter = inList('item_id', 'ids', itemIds);
    return this.context.sql.all(
      STORED_ANALYSIS,
      `select ${COLUMNS} from photo_analysis where ${filter.text} order by item_id`,
      filter.parameters,
    );
  }

  save(analysis: PhotoAnalysisWrite): void {
    this.context.write(() => {
      this.context.sql.run(
        'save the photo analysis',
        `insert into photo_analysis (${COLUMNS})
          values ($itemId, $rev, $model, $state, $caption, $scene, $labels, $pets, $error, $now)
          on conflict (item_id) do update set rev = excluded.rev, model = excluded.model,
            state = excluded.state, caption = excluded.caption, scene = excluded.scene,
            labels = excluded.labels, pets = excluded.pets, error = excluded.error,
            analysed_at = excluded.analysed_at`,
        {
          itemId: analysis.itemId,
          rev: analysis.rev,
          model: analysis.model,
          state: analysis.state,
          caption: analysis.caption,
          scene: analysis.scene,
          labels: jsonText(analysis.labels),
          pets: jsonText(analysis.pets),
          error: analysis.error,
          now: this.context.now(),
        },
      );
    });
  }

  countsByState(): Record<PhotoAnalysisState, number> {
    const counts: Record<PhotoAnalysisState, number> = {
      done: 0,
      failed: 0,
      needs_key: 0,
      skipped: 0,
    };
    for (const row of this.context.sql.all(
      STATE_COUNT,
      'select state, count(*) as total from photo_analysis group by state',
    )) {
      counts[row.state] = row.total;
    }
    return counts;
  }

  remove(itemId: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'remove the photo analysis',
        'delete from photo_analysis where item_id = $itemId',
        { itemId },
      );
    });
  }

  removeAll(): number {
    return this.context.write(() =>
      this.context.sql.run('remove every photo analysis', 'delete from photo_analysis'),
    );
  }
}
