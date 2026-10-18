import type { Unsubscribe } from '../contract';
import type { ShellySession } from './session';
import type { ShellyContext } from './settings';

const VIEWERS_HOLDER = 'viewers';

type ViewerPorts = Pick<ShellyContext, 'viewers' | 'log'>;

export class ViewerTracking {
  private readonly watches = new Map<string, Unsubscribe>();

  constructor(
    private readonly ports: ViewerPorts,
    private readonly sessionOf: (externalId: string) => ShellySession | undefined,
  ) {}

  watch(externalId: string): void {
    this.watches.get(externalId)?.();
    this.watches.set(
      externalId,
      this.ports.viewers.watchDevice(externalId, (viewed) => {
        this.follow(externalId, viewed);
      }),
    );
  }

  forget(externalId: string): void {
    this.watches.get(externalId)?.();
    this.watches.delete(externalId);
  }

  stop(): void {
    for (const unwatch of this.watches.values()) unwatch();
    this.watches.clear();
  }

  private follow(externalId: string, viewed: boolean): void {
    const session = this.sessionOf(externalId);
    if (session === undefined) return;
    const change = viewed
      ? session.startTracking(VIEWERS_HOLDER)
      : session.stopTracking(VIEWERS_HOLDER);
    change.catch((cause: unknown) => {
      this.ports.log.warn('shelly.live_view_failed', {
        externalId,
        viewed,
        reason: cause instanceof Error ? cause.name : 'unknown',
      });
    });
  }
}
