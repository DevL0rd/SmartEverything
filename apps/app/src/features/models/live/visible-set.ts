import {
  visibilityRegistry,
  type StageReport,
  type VisibilityRegistry,
} from '../../../components/house-map/live-visibility/registry';

export const LIVE_STAGE_PREFIX = 'model-live:';

export function liveStageId(viewId: string): string {
  return `${LIVE_STAGE_PREFIX}${viewId}`;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export class LiveViewSet {
  private readonly functioning = new Map<string, boolean>();
  private readonly listeners = new Set<() => void>();
  private live: readonly string[] = [];
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly registry: VisibilityRegistry = visibilityRegistry) {}

  readonly join = (viewId: string, functioning: boolean): (() => void) => {
    this.functioning.set(viewId, functioning);
    this.watch();
    const unregister = this.registry.register(liveStageId(viewId));
    this.refresh();
    return (): void => {
      unregister();
      this.functioning.delete(viewId);
      this.refresh();
      if (this.functioning.size === 0) this.unwatch();
    };
  };

  readonly report = (viewId: string, change: StageReport): void => {
    this.registry.report(liveStageId(viewId), change);
  };

  readonly setFunctioning = (viewId: string, functioning: boolean): void => {
    if (this.functioning.get(viewId) === undefined) return;
    if (this.functioning.get(viewId) === functioning) return;
    this.functioning.set(viewId, functioning);
    this.refresh();
  };

  readonly isLive = (viewId: string): boolean => this.live.includes(viewId);

  readonly liveIds = (): readonly string[] => this.live;

  readonly joinedCount = (): number => this.functioning.size;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  };

  private watch(): void {
    this.unsubscribe ??= this.registry.subscribe(() => {
      this.refresh();
    });
  }

  private unwatch(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private compute(): readonly string[] {
    return [...this.functioning]
      .filter(([viewId, working]) => working && this.registry.getStage(liveStageId(viewId)).live)
      .map(([viewId]) => viewId);
  }

  private refresh(): void {
    const next = this.compute();
    if (sameIds(next, this.live)) return;
    this.live = next;
    for (const listener of [...this.listeners]) listener();
  }
}
