import type { DriveItem, DriveRoot, DriveScrubState } from '@smarteverything/domain';
import { background, messageOf, type Logger } from '@smarteverything/logging';
import type { DriveItemIdentity } from '../store/repositories/drive-items';
import type { DriveRootsRepository } from '../store/repositories/drive-roots';
import type {
  DriveScrubCandidate,
  DriveScrubRepository,
  DriveScrubResult,
} from '../store/repositories/drive-scrub';
import type { Store } from '../store/store';
import type { HashRequest, HashResponse } from './blocks';
import { modifiedIso } from './hasher';
import type { RootAvailability } from './volumes';

const WINDOW_ROWS = 1000;

export interface FileHasher {
  request(fields: Omit<HashRequest, 'id'>): Promise<HashResponse>;
  close(): Promise<void>;
}

export interface ScrubItems {
  find(id: string): DriveItem | undefined;
  identityOf(id: string): DriveItemIdentity | null;
  setIntegrity(id: string, integrity: DriveScrubResult): void;
}

export interface ScrubCorruption {
  readonly rootId: string;
  readonly itemId: string;
  readonly relPath: string;
  readonly expected: string;
  readonly actual: string;
}

export interface ScrubEnvironment {
  readonly store: Pick<Store, 'feed' | 'write' | 'now'> & {
    readonly driveRoots: Pick<DriveRootsRepository, 'list' | 'find' | 'update'>;
    readonly driveItems: ScrubItems;
    readonly driveScrub: DriveScrubRepository;
  };
  readonly availability: (root: DriveRoot) => Promise<RootAvailability>;
  readonly openHasher: () => FileHasher;
  readonly notifyOwner: (corruption: ScrubCorruption) => void;
  readonly log: Logger;
}

type PhysicalRoot = DriveRoot & { readonly path: string };

interface Pass {
  readonly startedAt: string;
  checked: number;
  total: number;
  corrupt: number;
}

interface ActiveRun {
  readonly controller: AbortController;
  readonly pass: Pass;
  readonly finished: Promise<void>;
}

function physical(root: DriveRoot): PhysicalRoot | null {
  return root.path === null ? null : { ...root, path: root.path };
}

function shareOf(count: number, total: number): number {
  return total === 0 ? 1 : count / total;
}

function strictlyAfter(moment: string, floor: string | null): string {
  if (floor === null || moment > floor) return moment;
  return new Date(new Date(floor).getTime() + 1).toISOString();
}

function cutoffOf(root: DriveRoot): string {
  return root.health.lastScrubAt ?? '';
}

class RootScrub {
  constructor(
    private readonly env: ScrubEnvironment,
    private readonly root: PhysicalRoot,
    private readonly pass: Pass,
    private readonly hasher: FileHasher,
  ) {}

  async run(signal: AbortSignal): Promise<boolean> {
    const cutoff = cutoffOf(this.root);
    let after: string | null = null;
    for (;;) {
      const window = this.env.store.driveScrub.next(this.root.id, cutoff, after, WINDOW_ROWS);
      const last = window.at(-1);
      if (last === undefined) return true;
      for (const candidate of window) {
        if (signal.aborted) return false;
        await this.verify(candidate);
      }
      after = last.itemId;
    }
  }

  private async verify(candidate: DriveScrubCandidate): Promise<void> {
    const item = this.env.store.driveItems.find(candidate.itemId);
    const identity = item === undefined ? null : this.env.store.driveItems.identityOf(item.id);
    if (item === undefined || item.kind === 'folder' || identity === null) return;
    const response = await this.hasher.request({
      rootPath: this.root.path,
      relPath: item.relPath,
      dev: identity.dev,
      ino: identity.ino,
      withBlocks: false,
    });
    if (response.kind === 'skipped') {
      this.env.log.warn('drive.scrub_skipped', {
        rootId: this.root.id,
        relPath: item.relPath,
        reason: response.reason,
        code: response.code,
      });
      return;
    }
    if (!this.unchanged(candidate, item, response)) {
      this.env.log.info('drive.scrub_changed', { rootId: this.root.id, relPath: item.relPath });
      return;
    }
    this.settle(item, candidate.sha256, response.sha256);
  }

  private unchanged(
    candidate: DriveScrubCandidate,
    item: DriveItem,
    response: Extract<HashResponse, { readonly kind: 'hashed' }>,
  ): boolean {
    return (
      item.kind !== 'folder' &&
      item.sha256 === candidate.sha256 &&
      item.bytes === response.bytes &&
      item.modifiedAt === modifiedIso(response.modifiedMs)
    );
  }

  private settle(item: DriveItem, expected: string, actual: string): void {
    const result: DriveScrubResult = expected === actual ? 'ok' : 'corrupt';
    this.env.store.write(() => {
      this.env.store.driveScrub.record(this.root.id, item.id, result);
      if (item.kind !== 'folder' && item.integrity !== result) {
        this.env.store.driveItems.setIntegrity(item.id, result);
      }
    });
    this.pass.checked += 1;
    this.env.store.feed.notice({
      type: 'drive_progress',
      rootId: this.root.id,
      phase: 'scrub',
      done: this.pass.checked,
      total: this.pass.total,
    });
    if (result === 'ok') return;
    this.pass.corrupt += 1;
    const corruption = {
      rootId: this.root.id,
      itemId: item.id,
      relPath: item.relPath,
      expected,
      actual,
    };
    this.env.log.error('drive.scrub_corrupt', new Error('The file no longer matches its hash.'), {
      ...corruption,
    });
    this.env.notifyOwner(corruption);
  }
}

export class DriveScrubber {
  private active: ActiveRun | null = null;
  private stoppedAt: Pass | null = null;
  private finishedAt: string | null;

  constructor(private readonly env: ScrubEnvironment) {
    this.finishedAt = this.latestFinish();
  }

  state(): DriveScrubState {
    const pass = this.active?.pass ?? this.stoppedAt;
    if (pass === null) {
      return { state: 'idle', lastFinishedAt: this.finishedAt, corrupt: this.corruptCount() };
    }
    return {
      state: this.active === null ? 'stopped' : 'running',
      startedAt: pass.startedAt,
      checked: pass.checked,
      total: pass.total,
      corrupt: pass.corrupt,
    };
  }

  start(): DriveScrubState {
    if (this.active !== null) return this.state();
    const pass = this.stoppedAt ?? this.newPass();
    this.stoppedAt = null;
    const controller = new AbortController();
    const finished = this.execute(pass, controller.signal);
    this.active = { controller, pass, finished };
    background(finished, 'drive.scrub_failed');
    return this.state();
  }

  stop(): DriveScrubState {
    this.active?.controller.abort();
    return this.state();
  }

  async settled(): Promise<void> {
    await this.active?.finished;
  }

  private newPass(): Pass {
    const roots = this.scrubbable();
    const progress = roots.map((root) =>
      this.env.store.driveScrub.progress(root.id, cutoffOf(root)),
    );
    return {
      startedAt: this.env.store.now().toISOString(),
      checked: progress.reduce((sum, one) => sum + one.checked, 0),
      total: progress.reduce((sum, one) => sum + one.total, 0),
      corrupt: progress.reduce((sum, one) => sum + one.corrupt, 0),
    };
  }

  private scrubbable(): PhysicalRoot[] {
    return this.env.store.driveRoots.list().flatMap((root) => {
      const found = physical(root);
      return found === null ? [] : [found];
    });
  }

  private latestFinish(): string | null {
    const moments = this.env.store.driveRoots
      .list()
      .flatMap((root) => (root.health.lastScrubAt === null ? [] : [root.health.lastScrubAt]));
    return moments.length === 0 ? null : moments.reduce((a, b) => (a > b ? a : b));
  }

  private corruptCount(): number {
    return this.env.store.driveRoots
      .list()
      .reduce((sum, root) => sum + this.env.store.driveScrub.corrupt(root.id), 0);
  }

  private async execute(pass: Pass, signal: AbortSignal): Promise<void> {
    const hasher = this.env.openHasher();
    const stopHasher = (): void => {
      background(hasher.close(), 'drive.scrub_hasher_close_failed');
    };
    signal.addEventListener('abort', stopHasher, { once: true });
    let completed = false;
    try {
      completed = await this.walkRoots(pass, signal, hasher);
    } catch (cause) {
      if (!signal.aborted) this.env.log.error('drive.scrub_failed', cause);
    } finally {
      signal.removeEventListener('abort', stopHasher);
      await hasher.close().catch((cause: unknown) => {
        this.env.log.warn('drive.scrub_hasher_close_failed', { message: messageOf(cause) });
      });
      this.conclude(pass, signal.aborted ? false : completed);
    }
  }

  private conclude(pass: Pass, completed: boolean): void {
    this.active = null;
    if (completed) {
      this.finishedAt = this.env.store.now().toISOString();
      this.env.log.info('drive.scrub_done', {
        checked: pass.checked,
        total: pass.total,
        corrupt: pass.corrupt,
      });
      return;
    }
    this.stoppedAt = pass;
    this.env.log.info('drive.scrub_stopped', { checked: pass.checked, total: pass.total });
  }

  private async walkRoots(pass: Pass, signal: AbortSignal, hasher: FileHasher): Promise<boolean> {
    for (const listed of this.scrubbable()) {
      if (signal.aborted) return false;
      const root = this.env.store.driveRoots.find(listed.id);
      const found = root === undefined ? null : physical(root);
      if (found === null) continue;
      const availability = await this.env.availability(found);
      if (availability !== 'online') {
        this.env.log.info('drive.scrub_unavailable', { rootId: found.id, availability });
        continue;
      }
      const finished = await new RootScrub(this.env, found, pass, hasher).run(signal);
      this.health(found.id, finished);
      if (!finished) return false;
    }
    return true;
  }

  private completedAt(rootId: string): string {
    return strictlyAfter(
      this.env.store.now().toISOString(),
      this.env.store.driveScrub.lastVerifiedAt(rootId),
    );
  }

  private health(rootId: string, finished: boolean): void {
    const root = this.env.store.driveRoots.find(rootId);
    if (root === undefined) return;
    const progress = this.env.store.driveScrub.progress(rootId, cutoffOf(root));
    const verified = this.env.store.driveScrub.verified(rootId);
    this.env.store.driveRoots.update(rootId, {
      health: {
        ...root.health,
        verifiedShare: Math.min(1, shareOf(verified, progress.total)),
        corrupt: progress.corrupt,
        lastScrubAt: finished ? this.completedAt(rootId) : root.health.lastScrubAt,
      },
    });
  }
}
