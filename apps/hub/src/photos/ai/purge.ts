import { z } from 'zod';
import type { StoreContext } from '../../store/context';
import type { PhotoVectorIndex } from './index';
import { itemsIn, type SubjectScope } from './scope';

const ID = z.strictObject({ id: z.string() });

export interface PurgeCounts {
  readonly analysis: number;
  readonly embeddings: number;
  readonly detections: number;
  readonly groups: number;
  readonly jobs: number;
}

export class PhotoAiPurge {
  constructor(
    private readonly context: StoreContext,
    private readonly index: PhotoVectorIndex,
  ) {}

  smartSearch(subject: string, scope: SubjectScope): PurgeCounts {
    const items = itemsIn(scope);
    const embedded = this.context.sql.all(
      ID,
      `select item_id as id from photo_embeddings where item_id in (${items})`,
      scope.parameters,
    );
    const run = (label: string, text: string, parameters = scope.parameters): number =>
      this.context.sql.run(label, text, parameters);
    const counts = this.context.write(() => ({
      analysis: run(
        'delete the photo analysis of a person who turned Smart search off',
        `delete from photo_analysis where item_id in (${items})`,
      ),
      embeddings: run(
        'delete the photo embeddings of a person who turned Smart search off',
        `delete from photo_embeddings where item_id in (${items})`,
      ),
      detections: run(
        'delete the pet detections of a person who turned Smart search off',
        `delete from photo_faces where kind = 'pet' and item_id in (${items})`,
      ),
      groups: run(
        'delete the pet groups of a person who turned Smart search off',
        "delete from photo_groups where profile_id = $owner and kind = 'pet'",
        { owner: subject },
      ),
      jobs: run(
        'forget the Smart search jobs of a person who turned it off',
        `delete from drive_media_jobs
          where kind in ('vision', 'embed', 'pet_embed') and item_id in (${items})`,
      ),
    }));
    this.context.sql.run(
      'clear the search labels of a person who turned Smart search off',
      `update drive_items_search set labels = '' where labels <> '' and item_id in (${items})`,
      scope.parameters,
    );
    for (const row of embedded) this.index.remove(row.id);
    return counts;
  }

  faceGrouping(subject: string, scope: SubjectScope): PurgeCounts {
    const items = itemsIn(scope);
    return this.context.write(() => ({
      analysis: 0,
      embeddings: 0,
      detections: this.context.sql.run(
        'delete the face detections of a person who turned Face grouping off',
        `delete from photo_faces where kind = 'person' and item_id in (${items})`,
        scope.parameters,
      ),
      groups: this.context.sql.run(
        'delete the people groups of a person who turned Face grouping off',
        "delete from photo_groups where profile_id = $owner and kind = 'person'",
        { owner: subject },
      ),
      jobs: this.context.sql.run(
        'forget the face jobs of a person who turned Face grouping off',
        `delete from drive_media_jobs where kind = 'faces' and item_id in (${items})`,
        scope.parameters,
      ),
    }));
  }
}
