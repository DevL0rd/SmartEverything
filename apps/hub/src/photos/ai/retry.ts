import type { StoreContext } from '../../store/context';
import type { PhotoConsent } from './consent';
import type { PhotoAiKind } from './queue';
import { itemsIn } from './scope';
import type { PhotoAiStatusReader } from './status';

export interface RetryEnvironment {
  readonly context: StoreContext;
  readonly consent: PhotoConsent;
  readonly status: PhotoAiStatusReader;
  readonly ownerIds: () => readonly string[];
  readonly reconcile: () => Promise<number>;
}

const FACE_KINDS: readonly PhotoAiKind[] = ['faces'];

const SMART_KINDS: readonly PhotoAiKind[] = ['vision', 'embed', 'pet_embed'];

export class PhotoAiRetry {
  constructor(private readonly env: RetryEnvironment) {}

  run(profileId: string): Promise<number> {
    const owner = this.env.ownerIds().includes(profileId);
    const subjects = this.env.status.subjects(profileId, owner);
    this.env.context.write(() => {
      for (const subject of subjects) {
        const switches = this.env.consent.switches(subject.profileId);
        const kinds = [
          ...(switches.faceGrouping ? FACE_KINDS : []),
          ...(switches.smartSearch ? SMART_KINDS : []),
        ];
        if (kinds.length === 0) continue;
        this.env.context.sql.run(
          'forget the failed photo AI jobs so they run again',
          `delete from drive_media_jobs where state = 'failed'
            and kind in (${kinds.map((kind) => `'${kind}'`).join(', ')})
            and item_id in (${itemsIn(subject.scope)})
            and rev = (select d.rev from drive_items d where d.id = drive_media_jobs.item_id)`,
          subject.scope.parameters,
        );
      }
    });
    return this.env.reconcile();
  }
}
