import { describe, expect, it, vi } from 'vitest';
import { createVisibilityRegistry, visibilityRegistry, type AppStateSource } from './registry';

const visible = { onScreen: true, screenFocused: true, stillReady: true };

describe('visibility registry', () => {
  it.each([1, 2, 5, 20])('keeps all %i visible stages live at the same time', (count) => {
    const registry = createVisibilityRegistry();
    const ids = Array.from({ length: count }, (_, index) => `stage-${String(index)}`);
    for (const id of ids) {
      registry.register(id, visible);
    }
    expect(registry.liveStageIds()).toEqual(ids);
    for (const id of ids) {
      expect(registry.getStage(id)).toEqual({ live: true, mounted: true, showStill: false });
    }
  });

  it('pauses only the stages that stop being visible', () => {
    const registry = createVisibilityRegistry();
    registry.register('hero', visible);
    registry.register('pinned', visible);
    registry.register('vacuum', visible);
    registry.report('pinned', { onScreen: false });
    expect(registry.liveStageIds()).toEqual(['hero', 'vacuum']);
    expect(registry.getStage('pinned')).toEqual({ live: false, mounted: false, showStill: true });
  });

  it('pauses and unmounts every stage on background and restores them in the foreground', () => {
    const registry = createVisibilityRegistry();
    registry.register('a', visible);
    registry.register('b', visible);
    registry.setAppForeground(false);
    expect(registry.liveStageIds()).toEqual([]);
    expect(registry.getStage('a').mounted).toBe(false);
    registry.setAppForeground(true);
    expect(registry.liveStageIds()).toEqual(['a', 'b']);
  });

  it('registers a new stage into the current foreground state', () => {
    const registry = createVisibilityRegistry();
    registry.setAppForeground(false);
    registry.register('late', visible);
    expect(registry.getStage('late').live).toBe(false);
    registry.setAppForeground(true);
    expect(registry.getStage('late').live).toBe(true);
  });

  it('pauses on a modal cover and keeps the DOM component mounted', () => {
    const registry = createVisibilityRegistry();
    registry.register('a', visible);
    registry.report('a', { modalCovered: true });
    expect(registry.getStage('a')).toEqual({ live: false, mounted: true, showStill: true });
    registry.report('a', { modalCovered: false });
    expect(registry.getStage('a').live).toBe(true);
  });

  it('notifies a stage listener only when its derived state changes', () => {
    const registry = createVisibilityRegistry();
    registry.register('a', visible);
    const listener = vi.fn();
    registry.subscribeStage('a', listener);
    registry.report('a', { stillReady: false });
    registry.report('a', { onScreen: true });
    expect(listener).not.toHaveBeenCalled();
    registry.report('a', { onScreen: false });
    expect(listener).toHaveBeenCalledTimes(1);
    registry.report('a', { onScreen: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not wake other stages for a change in one stage', () => {
    const registry = createVisibilityRegistry();
    registry.register('a', visible);
    registry.register('b', visible);
    const other = vi.fn();
    registry.subscribeStage('b', other);
    registry.report('a', { onScreen: false });
    expect(other).not.toHaveBeenCalled();
  });

  it('lets a listener subscribe before the stage registers', () => {
    const registry = createVisibilityRegistry();
    const listener = vi.fn();
    registry.subscribeStage('a', listener);
    registry.register('a', visible);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops notifying after unsubscribe and removes an unregistered stage', () => {
    const registry = createVisibilityRegistry();
    const unregister = registry.register('a', visible);
    const listener = vi.fn();
    const off = registry.subscribeStage('a', listener);
    off();
    registry.report('a', { onScreen: false });
    expect(listener).not.toHaveBeenCalled();
    unregister();
    expect(registry.liveStageIds()).toEqual([]);
    expect(registry.getStage('a').mounted).toBe(false);
  });

  it('ignores reports for stages that are not registered', () => {
    const registry = createVisibilityRegistry();
    registry.report('ghost', visible);
    expect(registry.liveStageIds()).toEqual([]);
  });

  it('follows the app state source on events and releases it', () => {
    const registry = createVisibilityRegistry();
    registry.register('a', visible);
    let emit: (state: string) => void = () => undefined;
    const remove = vi.fn();
    const source: AppStateSource = {
      currentState: 'active',
      addEventListener: (_type, listener) => {
        emit = listener;
        return { remove };
      },
    };
    const unbind = registry.bindAppState(source);
    emit('background');
    expect(registry.getStage('a').live).toBe(false);
    emit('active');
    expect(registry.getStage('a').live).toBe(true);
    unbind();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('moves with no timer: a pause is visible synchronously', () => {
    vi.useFakeTimers();
    try {
      const registry = createVisibilityRegistry();
      registry.register('a', visible);
      registry.report('a', { screenFocused: false });
      expect(registry.getStage('a').live).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('exports one shared registry', () => {
    expect(visibilityRegistry.liveStageIds()).toEqual([]);
  });
});
