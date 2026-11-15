import type { AppUpdateOutcome } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import type { FallbackControls } from '../model/adapter';
import { failureOf } from '../model/safe-reason';
import type { AppUpdateEvent, AppUpdateState, RunningVersion } from '../model/update-state';
import type { AppUpdateFallback, AppUpdatePrefs } from './update-prefs';

const log = new Logger('app.app-updates');

export interface FallbackHooks {
  readonly controls: FallbackControls;
  readonly fallback: () => AppUpdateFallback;
  readonly changeFallback: (fallback: AppUpdateFallback) => void;
  readonly changePrefs: (change: Partial<AppUpdatePrefs>) => void;
  readonly dispatch: (event: AppUpdateEvent) => void;
  readonly report: (outcome: AppUpdateOutcome) => void;
  readonly state: () => AppUpdateState;
  readonly check: () => Promise<void>;
}

function shown(hooks: FallbackHooks, recorded: NonNullable<AppUpdateFallback>): void {
  hooks.report({ updateId: recorded.updateId, outcome: 'fell_back', reason: recorded.reason });
  hooks.dispatch({
    type: 'fell_back',
    failedId: recorded.updateId,
    reason: failureOf('launch', recorded.reason).sentence,
  });
}

export function fellBack(hooks: FallbackHooks, updateId: string | null, reason: string): void {
  log.error('app_update.fell_back', new Error(reason), { updateId });
  const recorded = { updateId, reason };
  hooks.changeFallback(recorded);
  hooks.changePrefs({ pendingId: null, launchedId: null });
  background(hooks.controls.keepBuiltIn(), 'app_update.fallback_hold_failed', { updateId });
  shown(hooks, recorded);
}

export function resumeFallback(hooks: FallbackHooks, running: RunningVersion | null): void {
  const recorded = hooks.fallback();
  if (recorded === null) return;
  if (running?.kind === 'update' && running.id !== recorded.updateId) {
    log.info('app_update.fallback_superseded', {
      updateId: recorded.updateId,
      running: running.id,
    });
    hooks.changeFallback(null);
    return;
  }
  log.error('app_update.fallback_awaiting_decision', new Error(recorded.reason), {
    updateId: recorded.updateId,
  });
  shown(hooks, recorded);
}

function decidingOn(hooks: FallbackHooks): NonNullable<AppUpdateFallback> | null {
  const state = hooks.state();
  const recorded = hooks.fallback();
  if (state.kind !== 'fell_back' || state.deciding || recorded === null) return null;
  hooks.dispatch({ type: 'decision_started' });
  return recorded;
}

export async function stayOnBuiltIn(hooks: FallbackHooks): Promise<void> {
  const recorded = decidingOn(hooks);
  if (recorded === null) return;
  try {
    await hooks.controls.keepBuiltIn();
  } catch (error) {
    log.error('app_update.keep_built_in_failed', error, { updateId: recorded.updateId });
    hooks.dispatch({
      type: 'fell_back',
      failedId: recorded.updateId,
      reason: failureOf('restart', error).sentence,
    });
    return;
  }
  hooks.changeFallback(null);
  log.info('app_update.kept_built_in', { updateId: recorded.updateId });
  hooks.report({ updateId: recorded.updateId, outcome: 'kept_built_in', reason: null });
  hooks.dispatch({ type: 'kept_built_in' });
  await hooks.check();
}

export async function tryUpdateAgain(hooks: FallbackHooks): Promise<void> {
  const recorded = decidingOn(hooks);
  if (recorded === null) return;
  const { updateId } = recorded;
  log.info('app_update.fallback_retry', { updateId });
  hooks.changeFallback(null);
  if (updateId === null) {
    hooks.dispatch({ type: 'kept_built_in' });
    await hooks.check();
    return;
  }
  hooks.changePrefs({ pendingId: updateId, launchedId: updateId });
  try {
    await hooks.controls.relaunch(updateId);
  } catch (error) {
    const failure = failureOf('restart', error);
    log.error('app_update.fallback_retry_failed', error, { updateId });
    hooks.changePrefs({ pendingId: null, launchedId: null });
    hooks.changeFallback(recorded);
    hooks.dispatch({ type: 'fell_back', failedId: updateId, reason: failure.sentence });
  }
}
