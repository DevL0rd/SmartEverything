import { Logger, background } from '@smarteverything/logging';
import { backupHandle } from '../handle';
import { backupStatus, INITIAL_BACKUP_STATUS } from '../model/status';
import type { BackupPorts } from './ports';
import { BackupRunner } from './runner';

const log = new Logger('app.photos');

export interface BackupScope {
  readonly key: string;
  readonly authority: object;
  create(current: () => boolean, signal: AbortSignal): BackupPorts;
  attach(runner: BackupRunner, ports: BackupPorts, invalidate: () => void): () => void;
}

interface Session {
  readonly scope: BackupScope;
  readonly runner: BackupRunner;
  readonly off: () => void;
  readonly controller: AbortController;
  valid: boolean;
}

export class BackupSessions {
  private backgroundRun: Promise<void> | null = null;
  private session: Session | null = null;
  private foreground: BackupScope | null = null;
  private revision = 0;
  private pending: Promise<void> = Promise.resolve();

  setForeground(scope: BackupScope | null): Promise<void> {
    this.foreground = scope;
    return this.replace(scope);
  }

  get hasForeground(): boolean {
    return this.foreground !== null;
  }

  runBackground(load: () => Promise<BackupScope | null>): Promise<void> {
    this.backgroundRun ??= this.background(load).finally(() => {
      this.backgroundRun = null;
    });
    return this.backgroundRun;
  }

  private async background(load: () => Promise<BackupScope | null>): Promise<void> {
    const scope = this.foreground ?? (await load());
    if (this.foreground === null) await this.replace(scope);
    await this.pending;
    const current = this.session;
    try {
      await current?.runner.request();
    } finally {
      if (this.foreground === null && this.session === current) await this.replace(null);
    }
  }

  private replace(scope: BackupScope | null): Promise<void> {
    if (scope !== null && this.session?.valid === true && this.session.scope === scope) {
      return this.pending;
    }
    this.revision += 1;
    const revision = this.revision;
    const previous = this.session;
    if (previous !== null) {
      previous.valid = false;
      previous.controller.abort();
      previous.off();
    }
    const stopped = previous?.runner.stop() ?? Promise.resolve();
    this.session = null;
    backupHandle.set(null);
    backupStatus.set(INITIAL_BACKUP_STATUS);
    this.pending = this.pending
      .catch((error: unknown) => {
        log.warn('backup.previous_session_failed', {
          reason: error instanceof Error ? error.message : String(error),
        });
      })
      .then(async () => {
        await stopped;
        if (revision === this.revision && scope !== null) this.open(scope);
      });
    return this.pending;
  }

  private open(scope: BackupScope): void {
    const revision = this.revision;
    const controller = new AbortController();
    const ports = scope.create(() => revision === this.revision, controller.signal);
    const runner = new BackupRunner(ports);
    const off = scope.attach(runner, ports, () => {
      if (revision === this.revision) background(this.replace(null), 'backup.authority_stopped');
    });
    this.session = { scope, runner, off, controller, valid: true };
    backupHandle.set({ runner, deviceId: ports.identity.deviceId });
  }
}

export const backupSessions = new BackupSessions();
