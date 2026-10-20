import {
  NODE_VERB_SCOPES,
  STATE_TOPICS,
  type ComputerScope,
  type NodeDemandTopics,
  type StateParts,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ComputerControls } from './controls/controls';
import type { StopWatching } from './controls/session-controls';

type StateTopic = (typeof STATE_TOPICS)[number];

type Emit = (parts: StateParts) => void;

type StateSource = (emit: Emit, failed: (cause: unknown) => void) => StopWatching;

const RETRY_FIRST_MS = 1_000;
const RETRY_MAX_MS = 30_000;

function readOnce<State>(
  read: () => Promise<State>,
  part: (state: State) => StateParts,
): StateSource {
  return (emit, failed) => {
    let watching = true;
    let timer: NodeJS.Timeout | null = null;
    const attempt = (delayMs: number, first: boolean): void => {
      read().then(
        (state) => {
          if (watching) emit(part(state));
        },
        (cause: unknown) => {
          if (!watching) return;
          if (first) failed(cause);
          timer = setTimeout(() => {
            attempt(Math.min(delayMs * 2, RETRY_MAX_MS), false);
          }, delayMs);
        },
      );
    };
    attempt(RETRY_FIRST_MS, true);
    return (): void => {
      watching = false;
      if (timer !== null) clearTimeout(timer);
    };
  };
}

function sourcesOf(controls: ComputerControls): Readonly<Record<StateTopic, StateSource>> {
  return {
    audio: (emit) =>
      controls.audio.watch((audio) => {
        emit({ audio });
      }),
    displays: (emit) =>
      controls.displays.watch((displays) => {
        emit({ displays });
      }),
    windows: (emit) =>
      controls.windows.watch((windows) => {
        emit({ windows });
      }),
    tiling: (emit) =>
      controls.tiling.watch((tiling) => {
        emit({ tiling });
      }),
    system: readOnce(
      () => controls.system.settings.state(),
      (system) => ({ system }),
    ),
    services: readOnce(
      () => controls.system.services.list(),
      (services) => ({ services }),
    ),
  };
}

export interface StateWatchOptions {
  readonly controls: ComputerControls;
  readonly allows: (scope: ComputerScope) => boolean;
  readonly emit: Emit;
  readonly log: Logger;
}

export class StateWatch {
  private readonly sources: Readonly<Record<StateTopic, StateSource>>;
  private readonly stops = new Map<StateTopic, StopWatching>();

  constructor(private readonly options: StateWatchOptions) {
    this.sources = sourcesOf(options.controls);
  }

  sync(topics: NodeDemandTopics): void {
    const wanted = new Set(STATE_TOPICS.filter((topic) => this.wants(topic, topics)));
    for (const [topic, stop] of this.stops) {
      if (wanted.has(topic)) continue;
      stop();
      this.stops.delete(topic);
      this.options.log.debug('node.state_unwatched', { topic });
    }
    for (const topic of wanted) {
      if (this.stops.has(topic)) continue;
      this.stops.set(
        topic,
        this.sources[topic](this.options.emit, (cause) => {
          this.options.log.error('node.state_read_failed', cause, { topic });
        }),
      );
      this.options.log.debug('node.state_watched', { topic });
    }
  }

  stop(): void {
    this.sync({});
  }

  private wants(topic: StateTopic, topics: NodeDemandTopics): boolean {
    const scope = NODE_VERB_SCOPES[topic];
    return topics[topic] !== undefined && (scope === null || this.options.allows(scope));
  }
}
