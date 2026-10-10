import { statSync } from 'node:fs';
import type { ResponderAppStatus } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { searchDirectories } from './executables';
import { watchDirectory } from './file-watch';

const SETTLE_MS = 2000;

export interface AppsSource {
  readonly statuses: readonly ResponderAppStatus[];
  readonly refresh: () => Promise<readonly ResponderAppStatus[]>;
}

export interface AppsMonitorOptions {
  readonly apps: AppsSource;
  readonly changed: () => void;
  readonly log: Logger;
}

function isDirectory(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;
}

export class AppsMonitor {
  private checking = false;
  private again = false;
  private stops: (() => void)[] = [];

  constructor(private readonly options: AppsMonitorOptions) {}

  start(): void {
    this.stops = searchDirectories()
      .filter(isDirectory)
      .flatMap((directory) => this.watch(directory));
    this.recheck();
  }

  stop(): void {
    this.stops.splice(0).forEach((stop) => {
      stop();
    });
  }

  recheck(): void {
    if (this.checking) {
      this.again = true;
      return;
    }
    this.checking = true;
    const before = JSON.stringify(this.options.apps.statuses);
    this.options.apps
      .refresh()
      .then(
        (statuses): void => {
          if (JSON.stringify(statuses) !== before) {
            this.options.changed();
          }
        },
        (cause: unknown): void => {
          this.options.log.error('assistant.apps_unreadable', cause);
        },
      )
      .finally(() => {
        this.checking = false;
        if (this.again) {
          this.again = false;
          this.recheck();
        }
      });
  }

  private watch(directory: string): (() => void)[] {
    try {
      return [
        watchDirectory(
          directory,
          () => {
            this.recheck();
          },
          SETTLE_MS,
        ),
      ];
    } catch (cause) {
      this.options.log.warn('assistant.apps_folder_unwatched', {
        directory,
        reason: cause instanceof Error ? cause.message : String(cause),
      });
      return [];
    }
  }
}
