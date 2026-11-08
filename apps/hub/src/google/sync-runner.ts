import type {
  GoogleAccountRow,
  GoogleProduct,
  GoogleSyncTrigger,
  LiveChange,
  PlannerItemRow,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import { GoogleCallError } from '../planner/google/calendar-run';
import { GoogleApiError } from '../planner/google/tasks-wire';
import type { Store } from '../store/store';
import { GoogleRelinkRequired } from './tokens';

const log = new Logger('hub.google');

export const QUOTA_WINDOW_MS = 60_000;

const PRODUCT_SCOPE_NAMES: Readonly<Record<GoogleProduct, readonly string[]>> = {
  calendar: ['calendar.events', 'calendar.events.readonly'],
  tasks: ['tasks', 'tasks.readonly'],
};

export type GoogleSyncOutcome = 'synced' | 'unlinked' | 'backoff' | 'failed';

export interface ProductSync {
  sync(profileId: string, trigger: GoogleSyncTrigger): Promise<unknown>;
}

export type SyncListener = (profileId: string) => Promise<void>;

export interface GoogleSyncRunnerOptions {
  readonly store: Pick<Store, 'googleAccounts' | 'plannerCollections' | 'feed'>;
  readonly calendar: ProductSync;
  readonly tasks: ProductSync;
  readonly clock: Pick<Clock, 'now' | 'at'>;
}

interface ProductFailure {
  readonly product: GoogleProduct;
  readonly cause: unknown;
}

function granted(account: GoogleAccountRow, product: GoogleProduct): boolean {
  return account.scopes.some((scope) =>
    PRODUCT_SCOPE_NAMES[product].some((name) => scope.endsWith(`/${name}`)),
  );
}

function rateLimited(cause: unknown): boolean {
  return (
    (cause instanceof GoogleCallError || cause instanceof GoogleApiError) &&
    cause.failure.kind === 'rate_limited'
  );
}

function failureMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export class GoogleSyncRunner {
  private readonly flights = new Map<string, Promise<GoogleSyncOutcome>>();
  private readonly waiting = new Map<string, Cancel>();
  private readonly strikes = new Map<string, number>();
  private readonly listeners = new Set<SyncListener>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: GoogleSyncRunnerOptions) {}

  start(): void {
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      this.follow(change);
    });
    this.reconcile();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const cancel of this.waiting.values()) cancel();
    this.waiting.clear();
  }

  resumed(): void {
    this.reconcile();
  }

  forget(profileId: string): void {
    this.waiting.get(profileId)?.();
    this.waiting.delete(profileId);
    this.strikes.delete(profileId);
  }

  onSynced(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reminderPull = async (item: PlannerItemRow): Promise<void> => {
    await this.sync(item.profile_id, 'ring');
  };

  sync(profileId: string, trigger: GoogleSyncTrigger): Promise<GoogleSyncOutcome> {
    const running = this.flights.get(profileId);
    if (running !== undefined) return running;
    const flight = this.fly(profileId, trigger).finally(() => {
      this.flights.delete(profileId);
    });
    this.flights.set(profileId, flight);
    return flight;
  }

  private reconcile(): void {
    for (const account of this.options.store.googleAccounts.list()) {
      if (account.status !== 'linked') continue;
      background(this.sync(account.profile_id, 'reconcile'), 'google.sync_failed', {
        profileId: account.profile_id,
      });
    }
  }

  private follow(change: LiveChange): void {
    if (change.table !== 'planner_items') return;
    const row = change.record ?? change.oldRecord;
    if (row === null || this.flights.has(row.profile_id)) return;
    const collection = this.options.store.plannerCollections.find(
      row.collection_id,
      row.profile_id,
    );
    if (row.google === null && (collection?.google ?? null) === null) return;
    background(this.sync(row.profile_id, 'change'), 'google.sync_failed', {
      profileId: row.profile_id,
    });
  }

  private async fly(profileId: string, trigger: GoogleSyncTrigger): Promise<GoogleSyncOutcome> {
    const account = this.options.store.googleAccounts.find(profileId);
    if (account?.status !== 'linked') return 'unlinked';
    if (this.waiting.has(profileId)) {
      log.info('google.sync_deferred', { profileId, trigger });
      return 'backoff';
    }
    const failures = await this.runProducts(profileId, trigger, account);
    this.settle(profileId, failures);
    await this.announce(profileId);
    return failures.length === 0 ? 'synced' : 'failed';
  }

  private async runProducts(
    profileId: string,
    trigger: GoogleSyncTrigger,
    account: GoogleAccountRow,
  ): Promise<ProductFailure[]> {
    const failures: ProductFailure[] = [];
    for (const product of ['calendar', 'tasks'] as const) {
      if (!granted(account, product)) continue;
      try {
        await this.options[product].sync(profileId, trigger);
      } catch (cause) {
        failures.push({ product, cause });
        this.report(profileId, product, cause);
      }
    }
    return failures;
  }

  private report(profileId: string, product: GoogleProduct, cause: unknown): void {
    if (cause instanceof GoogleRelinkRequired) {
      log.warn('google.sync_needs_relink', { profileId, product });
      return;
    }
    log.error('google.sync_failed', cause, { profileId, product });
  }

  private settle(profileId: string, failures: readonly ProductFailure[]): void {
    if (failures.some((failure) => rateLimited(failure.cause))) this.backOff(profileId);
    else if (failures.length === 0) this.strikes.delete(profileId);
    const { googleAccounts } = this.options.store;
    if (googleAccounts.find(profileId)?.status !== 'linked') return;
    const [first] = failures;
    googleAccounts.update(
      profileId,
      first === undefined
        ? { last_sync_at: this.options.clock.now().toISOString(), last_error: null }
        : { last_error: failureMessage(first.cause) },
    );
  }

  private backOff(profileId: string): void {
    const strikes = (this.strikes.get(profileId) ?? 0) + 1;
    this.strikes.set(profileId, strikes);
    const retryAt = new Date(
      this.options.clock.now().getTime() + QUOTA_WINDOW_MS * 2 ** (strikes - 1),
    );
    log.warn('google.rate_limited', { profileId, strikes, retryAt: retryAt.toISOString() });
    this.waiting.get(profileId)?.();
    this.waiting.set(
      profileId,
      this.options.clock.at(retryAt, () => {
        this.waiting.delete(profileId);
        background(this.sync(profileId, 'reconcile'), 'google.sync_failed', { profileId });
      }),
    );
  }

  private async announce(profileId: string): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener(profileId);
      } catch (cause) {
        log.error('google.after_sync_failed', cause, { profileId });
      }
    }
  }
}
