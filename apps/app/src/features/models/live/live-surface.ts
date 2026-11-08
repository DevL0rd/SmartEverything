import type { ModelSpec } from '@smarteverything/domain';
import type { ChannelSignals } from '../../../components/models/channels';
import type { ModelView } from '../../../components/models/three/framing';
import type { StageTheme } from '../../../components/models/three/stage';
import type { LiveInspect } from './inspect';
import type { LiveModelKey } from './model-cache';
import type { LiveViewModel } from './renderer-core';
import { LiveViewSet } from './visible-set';

export interface LiveViewInput {
  readonly spec: ModelSpec;
  readonly model: LiveModelKey;
  readonly view: ModelView;
  readonly theme: StageTheme;
  readonly signals: ChannelSignals;
  readonly reduced: boolean;
  readonly functioning: boolean;
  readonly routeKey?: string | null;
  readonly inspect?: LiveInspect;
}

export class LiveSurface {
  private readonly inputs = new Map<string, LiveViewInput>();
  private readonly listeners = new Set<() => void>();
  private readonly drawnListeners = new Map<string, Set<() => void>>();
  private readonly drawnIds = new Set<string>();

  constructor(readonly set: LiveViewSet = new LiveViewSet()) {
    set.subscribe(() => {
      this.dropUndrawn();
      this.notify();
    });
  }

  readonly join = (id: string, input: LiveViewInput): (() => void) => {
    this.inputs.set(id, input);
    const leave = this.set.join(id, input.functioning);
    this.notify();
    return (): void => {
      this.inputs.delete(id);
      leave();
      this.drawnIds.delete(id);
      this.notify();
    };
  };

  readonly update = (id: string, input: LiveViewInput): void => {
    if (!this.inputs.has(id)) return;
    this.inputs.set(id, input);
    this.set.setFunctioning(id, input.functioning);
    if (this.set.isLive(id)) this.notify();
  };

  readonly live = (routeKey?: string | null): readonly LiveViewModel[] =>
    this.set.liveIds().flatMap((id) => {
      const input = this.inputs.get(id);
      if (input === undefined) return [];
      if (
        routeKey !== undefined &&
        input.routeKey !== null &&
        input.routeKey !== undefined &&
        input.routeKey !== routeKey
      )
        return [];
      return [{ id, ...input }];
    });

  readonly joinedCount = (): number => this.inputs.size;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  };

  readonly frameDrawn = (ids: readonly string[]): void => {
    const shown = new Set(ids);
    for (const id of [...this.drawnIds]) {
      if (!shown.has(id)) this.forgetDrawn(id);
    }
    for (const id of shown) {
      if (this.drawnIds.has(id) || !this.set.isLive(id)) continue;
      this.drawnIds.add(id);
      for (const listener of [...(this.drawnListeners.get(id) ?? [])]) listener();
    }
  };

  readonly isDrawn = (id: string): boolean => this.drawnIds.has(id);

  readonly subscribeDrawn = (id: string, listener: () => void): (() => void) => {
    const listeners = this.drawnListeners.get(id) ?? new Set<() => void>();
    listeners.add(listener);
    this.drawnListeners.set(id, listeners);
    return (): void => {
      listeners.delete(listener);
      if (listeners.size === 0) this.drawnListeners.delete(id);
    };
  };

  readonly clearDrawn = (): void => {
    for (const id of [...this.drawnIds]) this.forgetDrawn(id);
  };

  private dropUndrawn(): void {
    for (const id of [...this.drawnIds]) {
      if (!this.set.isLive(id)) this.forgetDrawn(id);
    }
  }

  private forgetDrawn(id: string): void {
    this.drawnIds.delete(id);
    for (const listener of [...(this.drawnListeners.get(id) ?? [])]) listener();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

export const liveSurface = new LiveSurface();
