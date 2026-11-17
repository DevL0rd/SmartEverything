import { ApiError, type PhotoAiReanalyse, type PhotoAiReanalysed } from '@smarteverything/domain';
import type { StoreContext } from '../../store/context';
import type { PhotoConsent } from './consent';
import { itemsIn, type SubjectScope } from './scope';
import type { PhotoAiModelStore } from './settings';
import type { PhotoAiStatusReader } from './status';

export interface ReanalysisEnvironment {
  readonly context: StoreContext;
  readonly consent: PhotoConsent;
  readonly models: PhotoAiModelStore;
  readonly status: PhotoAiStatusReader;
  readonly owner: () => string;
  readonly reconcile: () => Promise<number>;
}

export class PhotoAiReanalysis {
  constructor(private readonly env: ReanalysisEnvironment) {}

  estimate(everything: boolean): { readonly subjects: number; readonly micros: number } {
    const { status } = this.env;
    const subjects = status.subjects(this.env.owner(), true);
    const photos = everything ? status.analysable(subjects) : status.remaining(subjects);
    return { subjects: subjects.length, micros: photos * status.unitMicros() };
  }

  async run(request: PhotoAiReanalyse): Promise<PhotoAiReanalysed> {
    const current = this.estimate(request.everything);
    if (current.micros !== request.estimateMicros) {
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
        if (request.everything) this.forgetAnalysed(subject.scope);
      }
    });
    return { queued: await this.env.reconcile(), estimateMicros: current.micros };
  }

  private forgetAnalysed(scope: SubjectScope): void {
    this.env.context.sql.run(
      'forget the vision jobs of photos analysed by the current model',
      `delete from drive_media_jobs where kind = 'vision' and state not in ('queued', 'running')
        and item_id in (${itemsIn(scope)})`,
      scope.parameters,
    );
  }

  private forget(scope: SubjectScope, models: ReturnType<PhotoAiModelStore['read']>): void {
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
