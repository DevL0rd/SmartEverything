import type { LibraryBucket, LibraryPage, LibraryScope } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { messageOf } from '@smarteverything/logging';
import type { DriveActor } from '../../drive/access';
import { searchWordsOf } from '../../drive/search';
import type { MeaningHit } from '../ai/index';
import type { LibraryReader, PageQuery } from '../library';

export const MEANING_MIN_SCORE = 0.4;

export const MEANING_CACHE_MS = 60_000;

export interface MeaningSource {
  readonly meaning: (
    actor: DriveActor,
    text: string,
    minScore: number,
    signal?: AbortSignal,
  ) => Promise<MeaningHit[]>;
}

interface Cached {
  readonly at: number;
  readonly ids: Promise<readonly string[]>;
}

export class PhotoSearch {
  private readonly cache = new Map<string, Cached>();

  constructor(
    private readonly reader: LibraryReader,
    private readonly meaning: MeaningSource,
    private readonly log: Logger,
    private readonly now: () => number,
  ) {}

  async buckets(actor: DriveActor, scope: LibraryScope): Promise<LibraryBucket[]> {
    return this.reader.buckets(actor, scope, await this.resolve(actor, scope.meaning));
  }

  async page(actor: DriveActor, month: string, query: PageQuery): Promise<LibraryPage> {
    return this.reader.page(actor, month, query, await this.resolve(actor, query.meaning));
  }

  private resolve(actor: DriveActor, text: string | undefined): Promise<readonly string[]> {
    if (text === undefined) return Promise.resolve([]);
    const key = `${actor.profileId}\u0000${text}`;
    const now = this.now();
    for (const [stale, entry] of this.cache)
      if (now - entry.at >= MEANING_CACHE_MS) this.cache.delete(stale);
    const hit = this.cache.get(key);
    if (hit !== undefined && now - hit.at < MEANING_CACHE_MS) return hit.ids;
    const words = searchWordsOf(text);
    const queries = words.length > 1 ? [text, ...words] : [text];
    const ids = Promise.all(
      queries.map((query) => this.meaning.meaning(actor, query, MEANING_MIN_SCORE)),
    )
      .then((found) => [...new Set(found.flat().map((hit) => hit.itemId))])
      .catch((cause: unknown) => {
        this.cache.delete(key);
        this.log.warn('search.meaning_failed', { reason: messageOf(cause) });
        return [];
      });
    this.cache.set(key, { at: now, ids });
    return ids;
  }
}
