import type { NodeFrame, WindowsState } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { AppEventTracker, type AppEventBatch } from './app-events';
import type { ComputerControls } from './controls/controls';
import type { StopWatching, WindowControl } from './controls/session-controls';
import type { NodeLink } from './link';

export interface AppEventsWatchOptions {
  readonly windows: Pick<WindowControl, 'watch'>;
  readonly send: (batch: AppEventBatch) => void;
  readonly log: Logger;
}

export class AppEventsWatch {
  private stopWatching: StopWatching | null = null;
  private windows: WindowsState | null = null;
  private locked: boolean | null = null;
  private readonly tracker = new AppEventTracker();

  constructor(private readonly options: AppEventsWatchOptions) {}

  watch(wanted: boolean): void {
    if (wanted === (this.stopWatching !== null)) return;
    if (!wanted) {
      this.stop();
      return;
    }
    this.stopWatching = this.options.windows.watch((windows) => {
      this.windows = windows;
      this.report();
    });
    this.options.log.debug('node.app_events_watched', {});
  }

  lockChanged(locked: boolean | null): void {
    this.locked = locked;
    this.report();
  }

  stop(): void {
    if (this.stopWatching === null) return;
    this.stopWatching();
    this.stopWatching = null;
    this.windows = null;
    this.tracker.reset();
    this.options.log.debug('node.app_events_unwatched', {});
  }

  private report(): void {
    if (this.windows === null) return;
    const batch = this.tracker.observe(this.windows, this.locked);
    if (batch.events.length > 0) this.options.send(batch);
  }
}

export interface AppEventsSources {
  readonly controls: Pick<ComputerControls, 'windows'>;
  readonly link: Pick<NodeLink, 'send'>;
  readonly now: () => Date;
  readonly log: Logger;
}

export function appEventsOf({ controls, link, now, log }: AppEventsSources): AppEventsWatch {
  return new AppEventsWatch({
    windows: controls.windows,
    send: ({ baseline, events }): void => {
      const frame: NodeFrame = {
        type: 'app_events',
        at: now().toISOString(),
        baseline,
        events: [...events],
      };
      link.send(frame);
    },
    log,
  });
}
