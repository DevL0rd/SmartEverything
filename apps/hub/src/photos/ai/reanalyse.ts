import { ApiError, type PhotoAiReanalysed } from '@smarteverything/domain';
import type { StoreContext } from '../../store/context';
import type { PhotoConsent } from './consent';
import { itemsIn } from './scope';
import type { PhotoAiModelStore } from './settings';
import type { PhotoAiStatusReader } from './status';

export interface ReanalysisEnvironment {
  readonly context: StoreContext;
  readonly consent: PhotoConsent;
  readonly models: PhotoAiModelStore;
  readonly status: PhotoAiStatusReader;
  readonly owner: () => string;
  readonly reconcile: () => number;
}

export class PhotoAiReanalysis {
  constructor(private readonly env: ReanalysisEnvironment) {}

  estimate(): { readonly subjects: number; readonly micros: number } {
    const subjects = this.env.status.subjects(this.env.owner(), true);
    return {
      subjects: subjects.length,
      micros: this.env.status.remaining(subjects) * this.env.status.unitMicros(),
    };
  }

  run(confirmedMicros: number): PhotoAiReanalysed {
    const current = this.estimate();
    if (current.micros !== confirmedMicros) {
      throw new ApiError(
        'conflict',
        'The estimate changed since it was shown, so nothing was started.',
        `the estimate is now ${String(current.micros)} micros of a dollar`,
      );
    }
    const models = this.env.models.read();
    const subjects = this.env.status.subjects(this.env.owner(), true);
    this.env.context.write(() => {
      for (const subject of subjects) {
        if (!this.env.consent.smartSearch(subject.profileId)) continue;
        this.forget(subject.scope, models);
      }
    });
    return { queued: this.env.reconcile(), estimateMicros: current.micros };
  }

  private forget(
    scope: ReturnType<PhotoAiStatusReader['subjects']>[number]['scope'],
    models: ReturnType<PhotoAiModelStore['read']>,
  ): void {
    const items = itemsIn(scope);
    const parameters = { ...scope.parameters };
    const run = (label: string, text: string, extra: Record<string, string> = {}): void => {
      this.env.context.sql.run(label, text, { ...parameters, ...extra });
    };
    run(
      'forget the tag jobs of photos analysed by another model',
      `delete from drive_media_jobs where kind in ('vision', 'embed', 'pet_embed')
        and item_id in (${items}) and item_id not in
          (select item_id from photo_analysis where state = 'done' and model = $vision)`,
      { vision: models.vision },
    );
    run(
      'forget the search jobs of photos embedded by another model',
      `delete from drive_media_jobs where kind = 'embed' and item_id in (${items})
        and item_id in (select item_id from photo_embeddings where model <> $embedding)`,
      { embedding: models.embedding },
    );
    run(
      'forget the pet jobs of photos embedded by another model',
      `delete from drive_media_jobs where kind = 'pet_embed' and item_id in (${items})
        and item_id in (select item_id from photo_faces where kind = 'pet' and model <> $pet)`,
      { pet: models.petEmbedding },
    );
  }
}
