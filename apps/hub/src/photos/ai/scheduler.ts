import type { CommittedNotice, LiveChange } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { ChangeFeed } from '../../store/feed';
import { Coalesced } from '../../store/reader';
import { inSlices } from '../../store/slices';
import type { Store } from '../../store/store';
import type { MediaJobRunner } from '../pipeline/jobs';
import { candidatesOf, type CandidateScope } from './candidates';
import type { ConsentSwitches, PhotoConsent } from './consent';
import { PhotoAiPurge } from './purge';
import type { PhotoAiKind, PhotoAiQueue } from './queue';
import { subjectOf } from './scope';
import type { PhotoAiModelStore } from './settings';
import type { PhotoVectorIndex } from './index';

export interface SchedulerEnvironment {
  readonly store: Pick<Store, 'context' | 'personAccess' | 'reader' | 'driveFeed'>;
  readonly feed: Pick<ChangeFeed, 'subscribe' | 'subscribeNotices' | 'afterCommit'>;
  readonly media: Pick<MediaJobRunner, 'onTouched'>;
  readonly keys: { readonly onChange: (listener: () => void) => () => void };
  readonly queue: PhotoAiQueue;
  readonly consent: PhotoConsent;
  readonly models: PhotoAiModelStore;
  readonly index: PhotoVectorIndex;
  readonly log: Logger;
}

const OWNER = z.strictObject({ id: z.string() });

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
  private readonly pass: Coalesced;
  private readonly dirty = new Set<string>();
  private touchedThisTurn = false;
  private wholeLibrary = true;
  private seenSeq = 0;
  private cursor: number | null = null;
  private stops: (() => void)[] = [];

  constructor(private readonly env: SchedulerEnvironment) {
    this.purge = new PhotoAiPurge(env.store.context, env.index);
    this.pass = new Coalesced(
      async () => {
        await this.cycle();
      },
      (cause) => {
        env.log.error('schedule.failed', cause);
      },
    );
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
      this.env.media.onTouched((itemId) => {
        this.touched(itemId);
      }),
    ];
    this.defer();
  }

  idle(): Promise<void> {
    return this.pass.idle();
  }

  async stop(): Promise<void> {
    for (const stop of this.stops) stop();
    this.stops = [];
    await this.pass.stop();
  }

  async reconcile(): Promise<number> {
    const upTo = this.env.store.driveFeed.latestSeq();
    const queued = await this.schedule({ items: null, feedAfter: null, feedUpTo: upTo });
    this.cursor = Math.max(this.cursor ?? 0, upTo);
    return queued;
  }

  private async cycle(): Promise<void> {
    if (this.wholeLibrary || this.cursor === null) {
      this.wholeLibrary = false;
      this.dirty.clear();
      await this.reconcile();
      return;
    }
    const items = [...this.dirty];
    this.dirty.clear();
    const feedAfter = this.cursor;
    const feedUpTo = this.env.store.driveFeed.latestSeq();
    if (items.length === 0 && feedUpTo <= feedAfter) return;
    await this.schedule({ items, feedAfter, feedUpTo });
    this.cursor = Math.max(this.cursor, feedUpTo);
  }

  private async schedule(
    scope: Pick<CandidateScope, 'items' | 'feedAfter' | 'feedUpTo'>,
  ): Promise<number> {
    const models = this.env.models.read();
    const versions: Readonly<Record<PhotoAiKind, string>> = {
      faces: 'sface',
      vision: models.vision,
      embed: models.embedding,
      pet_embed: models.petEmbedding,
    };
    const homeOwner = this.env.store.personAccess.homeOwner();
    const subjects = this.subjects(homeOwner);
    let queued = 0;
    for (const kind of ORDER) {
      const allowed = subjects
        .filter(({ switches }) => (kind === 'faces' ? switches.faceGrouping : switches.smartSearch))
        .map(({ profileId }) => profileId);
      if (allowed.length === 0) continue;
      const candidates = await candidatesOf(this.env.store.reader, kind, {
        ...scope,
        allowed,
        homeOwner,
      });
      await inSlices(this.env.store.context, candidates, (candidate) => {
        if (this.env.queue.request(kind, candidate.id, candidate.rev, versions[kind])) queued += 1;
      });
    }
    return queued;
  }

  private subjects(
    homeOwner: string,
  ): readonly { readonly profileId: string; readonly switches: ConsentSwitches }[] {
    const owners = this.env.store.context.sql.all(
      OWNER,
      'select distinct owner_profile_id as id from drive_roots where owner_profile_id is not null',
    );
    const profileIds = new Set([homeOwner, ...owners.map(({ id }) => id)]);
    return [...profileIds].map((profileId) => ({
      profileId,
      switches: this.env.consent.switches(profileId),
    }));
  }

  resumeAfterKey(): void {
    for (const statement of NEEDS_KEY_RESUME)
      this.env.store.context.sql.run('queue the photo AI work that waited for a key', statement);
    this.defer();
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
    if (notice.type !== 'drive_changed') return;
    const latest = this.env.store.driveFeed.latestSeq();
    if (latest <= this.seenSeq && !this.touchedThisTurn) this.wholeLibrary = true;
    this.seenSeq = Math.max(this.seenSeq, latest);
    this.pass.trigger();
  }

  private touched(itemId: string): void {
    this.dirty.add(itemId);
    this.touchedThisTurn = true;
    queueMicrotask(() => {
      this.touchedThisTurn = false;
    });
    this.env.feed.afterCommit(() => {
      this.pass.trigger();
    });
  }

  private defer(): void {
    this.wholeLibrary = true;
    this.pass.trigger();
  }
}
