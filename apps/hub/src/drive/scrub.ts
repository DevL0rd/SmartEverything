import type { DriveItem, DriveScrubState } from '@smarteverything/domain';
import type { StoredDrive } from '../store/repositories/drive-roots';
import { background, messageOf, type Logger } from '@smarteverything/logging';
import type { DriveScrubCandidate, DriveScrubResult } from '../store/repositories/drive-scrub';
import type { Store } from '../store/store';
import type { HashRequest, HashResponse } from './blocks';
import { isFileItem } from './file-item';
import { modifiedIso } from './units/hash';
import type { RootAvailability } from './root-marker';
import type {
  ScrubCandidate,
  ScrubHealthInput,
  ScrubOverview,
  ScrubRecordInput,
  ScrubWindow,
  ScrubWindowInput,
} from './units/scrub';

const WINDOW_ROWS = 1000;

const FILESYSTEM_DAMAGE_CODES: ReadonlySet<string> = new Set(['EIO', 'EUCLEAN', 'EBADMSG']);

export interface FileHasher {
  request(fields: Omit<HashRequest, 'id'>): Promise<HashResponse>;
  close(): Promise<void>;
}

export interface ScrubCorruption {
  readonly rootId: string;
  readonly itemId: string;
  readonly relPath: string;
  readonly expected: string;
  readonly actual: string;
  readonly cause: 'hash' | 'filesystem';
}

export interface ScrubUnits {
  readonly window: (input: ScrubWindowInput) => Promise<ScrubWindow>;
  readonly record: (input: ScrubRecordInput) => Promise<void>;
  readonly overview: () => Promise<ScrubOverview>;
  readonly health: (input: ScrubHealthInput) => Promise<void>;
}

export interface ScrubEnvironment {
  readonly store: Pick<Store, 'feed' | 'now'>;
  readonly units: ScrubUnits;
  readonly availability: (root: StoredDrive) => Promise<RootAvailability>;
  readonly openHasher: () => FileHasher;
  readonly notifyOwner: (corruption: ScrubCorruption) => void;
  readonly log: Logger;
}

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

function cutoffOf(root: StoredDrive): string {
  return root.health.lastScrubAt ?? '';
}

class RootScrub {
  constructor(
    private readonly env: ScrubEnvironment,
    private readonly root: StoredDrive,
    private readonly pass: Pass,
    private readonly hasher: FileHasher,
  ) {}

  async run(signal: AbortSignal): Promise<boolean> {
    const cutoff = cutoffOf(this.root);
    let after: string | null = null;
    for (;;) {
      const window = await this.env.units.window({
        rootId: this.root.id,
        cutoff,
        after,
        limit: WINDOW_ROWS,
      });
      if (window.last === null) return true;
      for (const candidate of window.candidates) {
        if (signal.aborted) return false;
        await this.verify(candidate);
      }
      after = window.last;
    }
  }

  private async verify(found: ScrubCandidate): Promise<void> {
    const { candidate, item, identity } = found;
    const response = await this.hasher.request({
      rootPath: this.root.path,
      relPath: item.relPath,
      dev: identity.dev,
      ino: identity.ino,
      withBlocks: false,
    });
    if (response.kind === 'skipped') {
      if (response.reason === 'unreadable' && FILESYSTEM_DAMAGE_CODES.has(response.code)) {
        await this.settle(item, candidate.sha256, `unreadable:${response.code}`, 'filesystem');
        return;
      }
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
    await this.settle(item, candidate.sha256, response.sha256, 'hash');
  }

  private unchanged(
    candidate: DriveScrubCandidate,
    item: DriveItem,
    response: Extract<HashResponse, { readonly kind: 'hashed' }>,
  ): boolean {
    return (
      isFileItem(item) &&
      item.sha256 === candidate.sha256 &&
      item.bytes === response.bytes &&
      item.modifiedAt === modifiedIso(response.modifiedMs)
    );
  }

  private async settle(
    item: DriveItem,
    expected: string,
    actual: string,
    cause: ScrubCorruption['cause'],
  ): Promise<void> {
    const result: DriveScrubResult = expected === actual ? 'ok' : 'corrupt';
    await this.env.units.record({ rootId: this.root.id, item, result });
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
      cause,
    };
    const reason =
      cause === 'filesystem'
        ? 'The filesystem could not read the file back.'
        : 'The file no longer matches its hash.';
    this.env.log.error('drive.scrub_corrupt', new Error(reason), {
      ...corruption,
    });
    this.env.notifyOwner(corruption);
  }
}

export class DriveScrubber {
  private active: ActiveRun | null = null;
  private stoppedAt: Pass | null = null;
  private finishedAt: string | null | undefined;

  constructor(private readonly env: ScrubEnvironment) {}

  async state(): Promise<DriveScrubState> {
    const pass = this.active?.pass ?? this.stoppedAt;
    if (pass === null) {
      const overview = await this.env.units.overview();
      this.finishedAt ??= overview.lastFinishedAt;
      return { state: 'idle', lastFinishedAt: this.finishedAt, corrupt: overview.corrupt };
    }
    return this.passState(pass);
  }

  private passState(pass: Pass): DriveScrubState {
    return {
      state: this.active === null ? 'stopped' : 'running',
      startedAt: pass.startedAt,
      checked: pass.checked,
      total: pass.total,
      corrupt: pass.corrupt,
    };
  }

  async start(): Promise<DriveScrubState> {
    if (this.active !== null) return this.passState(this.active.pass);
    const pass = this.stoppedAt ?? (await this.newPass());
    const joined = this.running();
    if (joined !== null) return this.passState(joined.pass);
    this.stoppedAt = null;
    const controller = new AbortController();
    const finished = this.execute(pass, controller.signal);
    this.active = { controller, pass, finished };
    background(finished, 'drive.scrub_failed');
    return this.passState(pass);
  }

  stop(): void {
    this.active?.controller.abort();
  }

  private running(): ActiveRun | null {
    return this.active;
  }

  async settled(): Promise<void> {
    await this.active?.finished;
  }

  private async newPass(): Promise<Pass> {
    const { progress } = await this.env.units.overview();
    return {
      startedAt: this.env.store.now().toISOString(),
      checked: progress.reduce((sum, one) => sum + one.checked, 0),
      total: progress.reduce((sum, one) => sum + one.total, 0),
      corrupt: progress.reduce((sum, one) => sum + one.corrupt, 0),
    };
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
    const { roots } = await this.env.units.overview();
    for (const found of roots) {
      if (signal.aborted) return false;
      const availability = await this.env.availability(found);
      if (availability !== 'online') {
        this.env.log.info('drive.scrub_unavailable', { rootId: found.id, availability });
        continue;
      }
      const finished = await new RootScrub(this.env, found, pass, hasher).run(signal);
      await this.env.units.health({
        rootId: found.id,
        finished,
        at: this.env.store.now().toISOString(),
      });
      if (!finished) return false;
    }
    return true;
  }
}
