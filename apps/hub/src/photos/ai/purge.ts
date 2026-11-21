import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { StoreContext } from '../../store/context';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import { PhotoConsent, type ConsentSwitches } from './consent';
import { PHOTOS_AI_AREA } from './defaults';
import { itemsIn, subjectOf, type SubjectScope } from './scope';

const log = new Logger(PHOTOS_AI_AREA);

const ID = z.strictObject({ id: z.string() });

export interface PurgeCounts {
  readonly analysis: number;
  readonly embeddings: number;
  readonly detections: number;
  readonly groups: number;
  readonly jobs: number;
}

export interface SmartSearchPurge {
  readonly counts: PurgeCounts;
  readonly unindexed: readonly string[];
}

class PhotoAiPurge {
  constructor(private readonly context: StoreContext) {}

  smartSearch(subject: string, scope: SubjectScope): SmartSearchPurge {
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
    return { counts, unindexed: embedded.map((row) => row.id) };
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

export interface ConsentPurge {
  readonly switches: ConsentSwitches;
  readonly smartSearch: SmartSearchPurge | null;
  readonly faceGrouping: PurgeCounts | null;
}

function purgeConsent(
  store: HostStore,
  input: { readonly profileId: string; readonly before: ConsentSwitches | undefined },
): ConsentPurge {
  const { profileId, before } = input;
  const switches = new PhotoConsent(store, log).switches(profileId);
  const scope = subjectOf(profileId, store.personAccess.ownerIds().includes(profileId));
  const purge = new PhotoAiPurge(store.context);
  return {
    switches,
    smartSearch:
      !switches.smartSearch && (before?.smartSearch ?? true)
        ? purge.smartSearch(profileId, scope)
        : null,
    faceGrouping:
      !switches.faceGrouping && (before?.faceGrouping ?? true)
        ? purge.faceGrouping(profileId, scope)
        : null,
  };
}

export const PHOTO_AI_CONSENT_PURGE_UNIT = storeUnit(purgeConsent);
