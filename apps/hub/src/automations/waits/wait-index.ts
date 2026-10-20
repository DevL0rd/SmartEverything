import type { WaitResume } from '@smarteverything/flow/interpret/waits';
import type { Wait } from '@smarteverything/flow/state/run-state';
import type { Cancel, Clock } from '../../clock';
import type { ChangeFeed } from '../../store/feed';
import { ConditionFeed } from './condition-feed';
import { EventWaits, type SignalFeed } from './event-waits';
import type { AnswerFeed } from '../questions/desk';

export interface WaitIndexPorts {
  readonly feed: Pick<ChangeFeed, 'subscribe'>;
  readonly signals: SignalFeed;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly answers?: AnswerFeed | undefined;
}

const NOTHING: Cancel = () => undefined;

export class WaitIndex {
  private readonly conditions: ConditionFeed;
  private readonly events: EventWaits;
  private readonly answers: AnswerFeed | undefined;

  constructor(ports: WaitIndexPorts) {
    this.conditions = new ConditionFeed(ports.feed, ports.clock);
    this.events = new EventWaits(ports.signals);
    this.answers = ports.answers;
  }

  get listeners(): number {
    return this.conditions.listeners + this.events.listeners;
  }

  get timers(): number {
    return this.conditions.timers;
  }

  get waiting(): number {
    return this.conditions.waiting + this.events.waiting;
  }

  readonly watchKeys = (keys: readonly string[], changed: () => void): Cancel =>
    this.conditions.watch(keys, changed);

  readonly watch = (wait: Wait, resume: (resume: WaitResume) => void): Cancel => {
    if (wait.kind === 'condition') {
      return this.conditions.watch(wait.deps, () => {
        resume({ kind: 'evaluate' });
      });
    }
    if (wait.kind === 'event') {
      return this.events.watch(wait, (signal) => {
        resume({ kind: 'signal', signal });
      });
    }
    if (wait.kind === 'answer') return this.answers?.watch(wait, resume) ?? NOTHING;
    return NOTHING;
  };
}
