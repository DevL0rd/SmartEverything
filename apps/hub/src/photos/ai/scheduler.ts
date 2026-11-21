import type { CommittedNotice, LiveChange } from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { ChangeFeed } from '../../store/feed';
import { Coalesced } from '../../store/reader';
import type { Store } from '../../store/store';
import type { MediaJobRunner } from '../pipeline/jobs';
import { candidatesOf, type CandidateScope } from './candidates';
import type { ConsentSwitches } from './consent';
import type { PhotoAiKind, PhotoAiQueue } from './queue';
import type { PhotoVectorIndex } from './index';

export interface SchedulerEnvironment {
  readonly store: Pick<Store, 'host' | 'reader'>;
  readonly feed: Pick<ChangeFeed, 'subscribe' | 'subscribeNotices' | 'afterCommit'>;
  readonly media: Pick<MediaJobRunner, 'onTouched'>;
  readonly keys: { readonly onChange: (listener: () => void) => () => void };
  readonly queue: PhotoAiQueue;
  readonly index: PhotoVectorIndex;
  readonly log: Logger;
}

const ORDER: readonly PhotoAiKind[] = ['faces', 'vision', 'embed', 'pet_embed'];

const REQUEST_BATCH = 256;

function layoutOwnerOf(change: LiveChange): string | null {
  if (change.table !== 'layouts') return null;
  const row = change.record ?? change.oldRecord;
  return row?.page === 'photos' ? row.profile_id : null;
}

export class PhotoAiScheduler {
  private readonly known = new Map<string, ConsentSwitches>();
  private readonly pass: Coalesced;
  private readonly dirty = new Set<string>();
  private readonly pending = new Set<Promise<void>>();
  private touchedThisTurn = false;
  private wholeLibrary = true;
  private seenSeq = 0;
  private cursor: number | null = null;
  private stops: (() => void)[] = [];

  constructor(private readonly env: SchedulerEnvironment) {
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
        if (profileId !== null)
          this.track(this.consentChanged(profileId), 'photos.consent_purge_failed');
      }),
      keys.onChange(() => {
        this.track(this.resumeAfterKey(), 'photos.key_resume_failed');
      }),
      this.env.media.onTouched((itemId) => {
        this.touched(itemId);
      }),
    ];
    this.defer();
  }

  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled(this.pending);
    await this.pass.idle();
  }

  private track(work: Promise<void>, event: string): void {
    const tracked: Promise<void> = work.finally(() => {
      this.pending.delete(tracked);
    });
    this.pending.add(tracked);
    background(tracked, event);
  }

  async stop(): Promise<void> {
    for (const stop of this.stops) stop();
    this.stops = [];
    await this.pass.stop();
  }

  async reconcile(): Promise<number> {
    const upTo = await this.latestSeq();
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
    const feedUpTo = await this.latestSeq();
    if (items.length === 0 && feedUpTo <= feedAfter) return;
    await this.schedule({ items, feedAfter, feedUpTo });
    this.cursor = Math.max(this.cursor, feedUpTo);
  }

  private async schedule(
    scope: Pick<CandidateScope, 'items' | 'feedAfter' | 'feedUpTo'>,
  ): Promise<number> {
    const { homeOwner, subjects, models } = await this.env.store.host.read('photoAiSubjects', null);
    const versions: Readonly<Record<PhotoAiKind, string>> = {
      faces: 'sface',
      vision: models.vision,
      embed: models.embedding,
      pet_embed: models.petEmbedding,
    };
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
      for (let at = 0; at < candidates.length; at += REQUEST_BATCH) {
        queued += await this.env.queue.request(
          candidates.slice(at, at + REQUEST_BATCH).map((candidate) => ({
            kind,
            itemId: candidate.id,
            rev: candidate.rev,
            modelVersion: versions[kind],
          })),
        );
      }
    }
    return queued;
  }

  private latestSeq(): Promise<number> {
    return this.env.store.host.call('driveFeed', 'latestSeq');
  }

  async resumeAfterKey(): Promise<void> {
    await this.env.store.host.write('photoAiResumeKey', null);
    this.defer();
  }

  async consentChanged(profileId: string): Promise<void> {
    const purged = await this.env.store.host.write('photoAiConsentPurge', {
      profileId,
      before: this.known.get(profileId),
    });
    this.known.set(profileId, purged.switches);
    if (purged.smartSearch !== null) {
      for (const itemId of purged.smartSearch.unindexed) this.env.index.remove(itemId);
      this.env.log.info('consent.smart_search_off', {
        profileId,
        ...purged.smartSearch.counts,
      });
    }
    if (purged.faceGrouping !== null) {
      this.env.log.info('consent.face_grouping_off', { profileId, ...purged.faceGrouping });
    }
    this.defer();
  }

  private noticed(notice: CommittedNotice): void {
    if (notice.type !== 'drive_changed') return;
    const latest = notice.cursor;
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
