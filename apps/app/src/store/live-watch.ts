import type {
  LiveClientMessageInput,
  ProcessWindow,
  WatchDemand,
  WatchTopic,
} from '@smarteverything/domain';
import { WATCH_DEBOUNCE_MS } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { ScreenPause } from '../design/screen-pause';
import { compareText } from '../format/text';

const log = new Logger('app.live-watch');
const NOTHING = '[]';

type Send = (message: LiveClientMessageInput) => void;
type Follower = (deviceId: string, demanded: boolean) => void;

interface Hold {
  readonly deviceId: string;
  readonly topics: readonly WatchTopic[];
  readonly processes: ProcessWindow | undefined;
}

function demandsOf(holds: ReadonlySet<Hold>): WatchDemand[] {
  const byDevice = new Map<string, { topics: Set<WatchTopic>; processes?: ProcessWindow }>();
  for (const hold of holds) {
    const known = byDevice.get(hold.deviceId) ?? { topics: new Set<WatchTopic>() };
    hold.topics.forEach((topic) => known.topics.add(topic));
    if (hold.processes !== undefined) known.processes = hold.processes;
    byDevice.set(hold.deviceId, known);
  }
  return [...byDevice]
    .sort(([left], [right]) => compareText(left, right))
    .map(([deviceId, known]) => ({
      deviceId,
      topics: [...known.topics].sort(),
      ...(known.processes === undefined ? {} : { processes: known.processes }),
    }));
}

export class LiveWatchRegistry {
  private readonly holds = new Set<Hold>();
  private readonly followers = new Set<Follower>();
  private send: Send | null = null;
  private sent = NOTHING;
  private timer: ReturnType<typeof setTimeout> | null = null;

  hold(deviceId: string, topics: readonly WatchTopic[], processes?: ProcessWindow): () => void {
    if (topics.length === 0) return (): void => undefined;
    const hold: Hold = { deviceId, topics, processes };
    const wasDemanded = this.demanded(deviceId);
    this.holds.add(hold);
    if (!wasDemanded) this.tell(deviceId, true);
    this.schedule();
    return (): void => {
      if (!this.holds.delete(hold)) return;
      if (!this.demanded(deviceId)) this.tell(deviceId, false);
      this.schedule();
    };
  }

  follow(follower: Follower): () => void {
    this.followers.add(follower);
    return (): void => {
      this.followers.delete(follower);
    };
  }

  attach(send: Send): void {
    this.send = send;
    this.sent = NOTHING;
    this.clearTimer();
    this.flush();
  }

  detach(): void {
    this.send = null;
    this.sent = NOTHING;
    this.clearTimer();
  }

  topicsOf(deviceId: string): ReadonlySet<string> {
    const topics = new Set<string>();
    for (const hold of this.holds) {
      if (hold.deviceId === deviceId) hold.topics.forEach((topic) => topics.add(topic));
    }
    return topics;
  }

  private demanded(deviceId: string): boolean {
    for (const hold of this.holds) if (hold.deviceId === deviceId) return true;
    return false;
  }

  private tell(deviceId: string, demanded: boolean): void {
    for (const follower of [...this.followers]) follower(deviceId, demanded);
  }

  private schedule(): void {
    if (this.send === null || this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, WATCH_DEBOUNCE_MS);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private flush(): void {
    const send = this.send;
    if (send === null) return;
    const demands = demandsOf(this.holds);
    const signature = JSON.stringify(demands);
    if (signature === this.sent) return;
    this.sent = signature;
    log.debug('watch.sent', { devices: demands.length });
    send({ type: 'watch', demands });
  }
}

export const liveWatch = new LiveWatchRegistry();

export function holdWhileLive(
  pause: Pick<ScreenPause, 'isPaused' | 'subscribe'>,
  take: () => () => void,
): () => void {
  let release: (() => void) | null = null;
  const follow = (): void => {
    if (pause.isPaused()) {
      release?.();
      release = null;
    } else {
      release ??= take();
    }
  };
  follow();
  const stop = pause.subscribe(follow);
  return (): void => {
    stop();
    release?.();
  };
}
