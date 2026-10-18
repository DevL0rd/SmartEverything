import type { SignalInput, SignalTriggerV2 } from '@smarteverything/domain';
import type { Clock } from '../clock';
import { SignalWatch } from './signal-watch';

export interface WatchedTrigger {
  readonly trigger: SignalTriggerV2;
  readonly pulse: boolean;
}

export interface WatchedAutomation {
  readonly automationId: string;
  readonly triggers: readonly WatchedTrigger[];
}

export interface SignalWatchersOptions {
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly fire: (automationId: string, signal: SignalInput) => void;
}

export class SignalWatchers {
  private watches: SignalWatch[] = [];

  constructor(private readonly options: SignalWatchersOptions) {}

  load(automations: readonly WatchedAutomation[]): void {
    this.stop();
    this.watches = automations.flatMap(({ automationId, triggers }) =>
      triggers.map(
        ({ trigger, pulse }) =>
          new SignalWatch({
            trigger,
            pulse,
            clock: this.options.clock,
            fire: (signal): void => {
              this.options.fire(automationId, signal);
            },
          }),
      ),
    );
  }

  observe(signal: SignalInput): void {
    for (const watch of this.watches) {
      watch.observe(signal);
    }
  }

  stop(): void {
    for (const watch of this.watches) {
      watch.stop();
    }
    this.watches = [];
  }
}
