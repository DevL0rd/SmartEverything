import type { CommittedNotice, LiveChange } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ChangeFeed } from '../../store/feed';
import type { Store } from '../../store/store';
import { candidatesOf } from './candidates';
import type { ConsentSwitches, PhotoConsent } from './consent';
import { PhotoAiPurge } from './purge';
import type { PhotoAiKind, PhotoAiQueue } from './queue';
import { subjectOf } from './scope';
import type { PhotoAiModelStore } from './settings';
import type { PhotoVectorIndex } from './index';

export interface SchedulerEnvironment {
  readonly store: Pick<Store, 'context' | 'personAccess'>;
  readonly feed: Pick<ChangeFeed, 'subscribe' | 'subscribeNotices'>;
  readonly keys: { readonly onChange: (listener: () => void) => () => void };
  readonly queue: PhotoAiQueue;
  readonly consent: PhotoConsent;
  readonly models: PhotoAiModelStore;
  readonly index: PhotoVectorIndex;
  readonly log: Logger;
}

const ORDER: readonly PhotoAiKind[] = ['faces', 'vision', 'embed', 'pet_embed'];

const NEEDS_KEY_RESUME = [
  `delete from drive_media_jobs where kind = 'vision' and item_id in
    (select item_id from photo_analysis where state = 'needs_key')`,
  `delete from drive_media_jobs where kind = 'embed' and state = 'done'
    and not exists (select 1 from photo_embeddings e
      where e.item_id = drive_media_jobs.item_id and e.rev = drive_media_jobs.rev)`,
  `delete from drive_media_jobs where kind = 'pet_embed' and state = 'done'
    and not exists (select 1 from photo_faces f
      where f.item_id = drive_media_jobs.item_id and f.rev = drive_media_jobs.rev and f.kind = 'pet')`,
] as const;

function layoutOwnerOf(change: LiveChange): string | null {
  if (change.table !== 'layouts') return null;
  const row = change.record ?? change.oldRecord;
  return row?.page === 'photos' ? row.profile_id : null;
}

export class PhotoAiScheduler {
  private readonly known = new Map<string, ConsentSwitches>();
  private readonly purge: PhotoAiPurge;
  private scheduled = false;
  private stops: (() => void)[] = [];

  constructor(private readonly env: SchedulerEnvironment) {
    this.purge = new PhotoAiPurge(env.store.context, env.index);
  }

  start(): void {
    const { feed, keys } = this.env;
    this.stops = [
      feed.subscribeNotices((notice) => {
        this.noticed(notice);
      }),
      feed.subscribe((change) => {
        const profileId = layoutOwnerOf(change);
        if (profileId !== null) this.consentChanged(profileId);
      }),
      keys.onChange(() => {
        this.resumeAfterKey();
      }),
    ];
    this.defer();
  }

  stop(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
  }

  reconcile(): number {
    const models = this.env.models.read();
    const versions: Readonly<Record<PhotoAiKind, string>> = {
      faces: 'sface',
      vision: models.vision,
      embed: models.embedding,
      pet_embed: models.petEmbedding,
    };
    let queued = 0;
    const allowed = new Map<string, ConsentSwitches>();
    const switchesOf = (profileId: string): ConsentSwitches => {
      const known = allowed.get(profileId) ?? this.env.consent.switches(profileId);
      allowed.set(profileId, known);
      return known;
    };
    for (const kind of ORDER) {
      for (const candidate of candidatesOf(this.env.store.context, kind)) {
        const subject = candidate.owner ?? this.env.store.personAccess.homeOwner();
        const switches = switchesOf(subject);
        if (kind === 'faces' ? !switches.faceGrouping : !switches.smartSearch) continue;
        if (this.env.queue.request(kind, candidate.id, candidate.rev, versions[kind])) queued += 1;
      }
    }
    return queued;
  }

  resumeAfterKey(): void {
    for (const statement of NEEDS_KEY_RESUME)
      this.env.store.context.sql.run('queue the photo AI work that waited for a key', statement);
    this.reconcile();
  }

  consentChanged(profileId: string): void {
    const now = this.env.consent.switches(profileId);
    const before = this.known.get(profileId);
    this.known.set(profileId, now);
    const scope = subjectOf(profileId, this.env.store.personAccess.ownerIds().includes(profileId));
    if (!now.smartSearch && (before?.smartSearch ?? true)) {
      this.env.log.info('consent.smart_search_off', {
        profileId,
        ...this.purge.smartSearch(profileId, scope),
      });
    }
    if (!now.faceGrouping && (before?.faceGrouping ?? true)) {
      this.env.log.info('consent.face_grouping_off', {
        profileId,
        ...this.purge.faceGrouping(profileId, scope),
      });
    }
    this.defer();
  }

  private noticed(notice: CommittedNotice): void {
    if (notice.type === 'drive_changed') this.defer();
  }

  private defer(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    setImmediate(() => {
      this.scheduled = false;
      try {
        this.reconcile();
      } catch (cause) {
        this.env.log.error('schedule.failed', cause);
      }
    });
  }
}
