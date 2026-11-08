import type { AppUpdateNotice, AppUpdateOutcome, AppUpdateSummary } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { ValueStore } from '../../../design/external-store';
import {
  RELEASE_UPDATE_CHANNEL,
  type AdapterStart,
  type EmergencyLaunch,
  type UpdateAdapter,
  type UpdateFailureCause,
} from '../model/adapter';
import { noticeMatches, type NoticeTarget } from '../model/notice-match';
import { failureOf, safeReason } from '../model/safe-reason';
import { ROLLBACK_CONFIRM } from '../model/update-copy';
import {
  INITIAL_UPDATE_STATE,
  holdsUpdate,
  offerOf,
  reduceAppUpdate,
  restartTargetOf,
  restartableTargetOf,
  type AppUpdateEvent,
  type AppUpdateState,
  type RunningVersion,
  type RestartTarget,
} from '../model/update-state';
import type { askToRestart } from './restart-confirmation';
import type { AppUpdatePrefs } from './update-prefs';

type PendingId = NonNullable<AppUpdatePrefs['pendingId']>;

const log = new Logger('app.app-updates');

export interface AppUpdateView {
  readonly state: AppUpdateState;
  readonly running: RunningVersion | null;
}

export const INITIAL_UPDATE_VIEW: AppUpdateView = { state: INITIAL_UPDATE_STATE, running: null };

export interface ControllerDeps {
  readonly adapter: UpdateAdapter;
  readonly report: (outcome: AppUpdateOutcome) => Promise<void>;
  readonly prefs: () => AppUpdatePrefs;
  readonly changePrefs: (change: Partial<AppUpdatePrefs>) => void;
  readonly token: () => string | null;
  readonly busy: () => boolean;
  readonly ask: typeof askToRestart;
  readonly now: () => number;
}

function runs(running: RunningVersion, pendingId: PendingId): boolean {
  return pendingId === 'built_in'
    ? running.kind === 'embedded'
    : running.kind === 'update' && running.id === pendingId;
}

function updateIdOf(pendingId: PendingId | null): string | null {
  return pendingId === 'built_in' ? null : pendingId;
}

function launchPrefsOf(target: RestartTarget): Pick<AppUpdatePrefs, 'pendingId' | 'launchedId'> {
  return target.kind === 'update'
    ? { pendingId: target.offer.id, launchedId: target.offer.id }
    : { pendingId: 'built_in', launchedId: null };
}

const NO_REASON = 'The update reported no reason.';

const NOT_APPLIED_REASON = 'The update was not running after the restart.';

function downloadableOffer(state: AppUpdateState): AppUpdateSummary | null {
  if (state.kind === 'available') return state.offer;
  return state.kind === 'failed' && state.cause === 'download' ? state.offer : null;
}

export type CheckTrigger = 'live' | 'notice' | 'button' | 'retry';

const MANUAL: ReadonlySet<CheckTrigger> = new Set(['button', 'retry']);

export class AppUpdateController {
  readonly view = new ValueStore<AppUpdateView>(INITIAL_UPDATE_VIEW);
  private runtimeVersion: string | null = null;
  private checking: Promise<void> | null = null;
  private checkingManual = false;
  private noticeDuringCheck = false;
  private asking: RestartTarget | null = null;
  private starting: Promise<void> | null = null;
  private started = false;
  private failures = 0;

  constructor(private readonly deps: ControllerDeps) {}

  state(): AppUpdateState {
    return this.view.get().state;
  }

  private reasonOf(error: unknown): string {
    return safeReason(error, this.deps.token());
  }

  private dispatch(event: AppUpdateEvent): void {
    const before = this.state();
    const state = reduceAppUpdate(before, event);
    if (state === before) return;
    log.info('app_update.state_changed', { from: before.kind, to: state.kind, event: event.type });
    this.view.set({ ...this.view.get(), state });
  }

  private report(outcome: AppUpdateOutcome): void {
    this.deps.report(outcome).catch((error: unknown) => {
      log.warn('app_update.report_failed', {
        outcome: outcome.outcome,
        reason: this.reasonOf(error),
      });
    });
  }

  private fail(
    cause: UpdateFailureCause,
    error: unknown,
    held: { readonly offer: AppUpdateSummary | null; readonly keep: RestartTarget | null },
  ): string {
    const failure = failureOf(cause, error);
    const detail = this.reasonOf(failure.detail);
    log.warn('app_update.failed', { cause: failure.cause, reason: detail });
    this.failures += 1;
    this.dispatch({
      type: 'failed',
      cause: failure.cause,
      reason: failure.sentence,
      offer: held.offer,
      target: failure.staysReady ? held.keep : null,
      sequence: this.failures,
    });
    return detail;
  }

  private async startAdapter(): Promise<AdapterStart | null> {
    try {
      return await this.deps.adapter.start();
    } catch (error) {
      this.fail('check', error, { offer: null, keep: null });
      return null;
    }
  }

  start(): Promise<void> {
    this.starting ??= this.begin();
    return this.starting;
  }

  private async begin(): Promise<void> {
    const started = await this.startAdapter();
    if (started === null) {
      this.starting = null;
      return;
    }
    this.started = true;
    if (started.kind === 'unsupported') {
      log.info('app_update.unsupported', { reason: started.reason });
      this.dispatch({ type: 'unsupported', reason: started.reason });
      return;
    }
    this.runtimeVersion = started.runtimeVersion;
    this.view.set({ ...this.view.get(), running: started.running });
    if (started.emergency === null) this.settlePending(started.running);
    else this.rolledBack(started.emergency);
  }

  private settlePending(running: RunningVersion | null): void {
    const { pendingId } = this.deps.prefs();
    if (pendingId === null || running === null) return;
    const updateId = updateIdOf(pendingId);
    this.deps.changePrefs({ pendingId: null });
    if (runs(running, pendingId)) {
      log.info('app_update.applied', { updateId });
      this.report({ updateId, outcome: 'applied', reason: null });
      return;
    }
    log.warn('app_update.not_applied', { updateId });
    this.report({ updateId, outcome: 'rolled_back', reason: NOT_APPLIED_REASON });
  }

  private rolledBack(emergency: EmergencyLaunch): void {
    const failedId = emergency.failedId ?? this.deps.prefs().launchedId;
    this.deps.changePrefs({ pendingId: null, launchedId: null });
    log.warn('app_update.rolled_back', { updateId: failedId, reason: emergency.reason });
    this.report({ updateId: failedId, outcome: 'rolled_back', reason: emergency.reason });
    this.dispatch({
      type: 'rolled_back',
      failedId,
      reason: failureOf('launch', emergency.reason ?? NO_REASON).sentence,
    });
  }

  check(trigger: CheckTrigger): Promise<void> {
    const manual = MANUAL.has(trigger);
    if (this.checking !== null) {
      if (trigger === 'notice') this.noticeDuringCheck = true;
      if (manual && !this.checkingManual) return this.checking.then(() => this.check(trigger));
      return this.checking;
    }
    this.checkingManual = manual;
    this.checking = this.runCheck(manual).finally(() => {
      this.checking = null;
      this.checkingManual = false;
      if (!this.noticeDuringCheck) return;
      this.noticeDuringCheck = false;
      return this.check(trigger);
    });
    return this.checking;
  }

  private async runCheck(manual: boolean): Promise<void> {
    if (!this.started) await this.start();
    if (!this.started || holdsUpdate(this.state())) return;
    this.dispatch({ type: 'check_started', manual });
    try {
      const outcome = await this.deps.adapter.check({ channel: RELEASE_UPDATE_CHANNEL });
      if (this.noticeDuringCheck) return;
      if (outcome.rollBackToEmbedded) {
        await this.rollBackToBuiltIn();
        return;
      }
      this.dispatch({
        type: 'checked',
        manual,
        outcome,
        running: this.view.get().running,
        at: new Date(this.deps.now()).toISOString(),
        app: this.deps.adapter.app,
      });
    } catch (error) {
      this.checkFailed(manual, error);
    }
  }

  private checkFailed(manual: boolean, error: unknown): void {
    const failure = failureOf('check', error);
    log.warn('app_update.check_failed', { manual, reason: this.reasonOf(failure.detail) });
    if (this.noticeDuringCheck) return;
    this.failures += 1;
    this.dispatch({
      type: 'check_failed',
      manual,
      reason: failure.sentence,
      sequence: this.failures,
    });
  }

  async download(expectedOfferId: AppUpdateSummary['id']): Promise<void> {
    while (this.checking !== null) await this.checking;
    const offer = downloadableOffer(this.state());
    if (offer?.id !== expectedOfferId) return;
    this.dispatch({ type: 'download_started', offer });
    try {
      await this.deps.adapter.download(offer, (progress) => {
        this.dispatch({ type: 'download_progress', offer, progress });
      });
    } catch (error) {
      this.downloadFailed(offer, error);
      return;
    }
    await this.downloaded(offer);
  }

  private downloadFailed(offer: AppUpdateSummary, error: unknown): void {
    const detail = this.fail('download', error, { offer, keep: null });
    this.report({ updateId: offer.id, outcome: 'download_failed', reason: detail });
  }

  private async downloaded(offer: AppUpdateSummary): Promise<void> {
    log.info('app_update.downloaded', { updateId: offer.id });
    this.dispatch({ type: 'downloaded', offer, busy: this.deps.busy() });
    if (this.state().kind === 'ready') await this.restart();
  }

  private async rollBackToBuiltIn(): Promise<void> {
    await this.deps.adapter.prepareRollback();
    if (this.noticeDuringCheck) return;
    this.deps.changePrefs({ pendingId: 'built_in' });
    log.info('app_update.rollback_ready', { from: this.view.get().running?.kind ?? null });
    this.dispatch({ type: 'rollback_ready', busy: this.deps.busy() });
  }

  async retry(expectedOfferId?: AppUpdateSummary['id']): Promise<void> {
    const state = this.state();
    if (expectedOfferId !== undefined && offerOf(state)?.id !== expectedOfferId) return;
    if (state.kind === 'rolled_back') return this.check('retry');
    if (state.kind !== 'failed') return;
    this.dispatch({ type: 'retry_started' });
    if (state.cause === 'download' && state.offer !== null) return this.download(state.offer.id);
    if (state.cause === 'restart' && state.target !== null) return this.restart();
    return this.check('retry');
  }

  requestRestart(expectedOfferId?: AppUpdateSummary['id'], restoreFocus?: () => void): void {
    const state = this.state();
    const target = restartableTargetOf(state);
    if (target === null) return;
    if (
      expectedOfferId !== undefined &&
      (target.kind !== 'update' || target.offer.id !== expectedOfferId)
    )
      return;
    if (target.kind === 'update') {
      background(this.restart(), 'app_update.restart_failed');
      return;
    }
    this.confirmRollback(target, restoreFocus);
  }

  private confirmRollback(target: RestartTarget, restoreFocus?: () => void): void {
    if (this.asking === target) return;
    this.asking = target;
    const answer =
      restoreFocus === undefined
        ? this.deps.ask(ROLLBACK_CONFIRM)
        : this.deps.ask(ROLLBACK_CONFIRM, 'ui', restoreFocus);
    answer.then(
      (accepted) => {
        if (this.asking !== target) return;
        this.asking = null;
        log.info('app_update.restart_answered', { accepted });
        if (accepted && restartTargetOf(this.state()) === target)
          background(this.restart(), 'app_update.restart_failed');
      },
      (error: unknown) => {
        if (this.asking === target) this.asking = null;
        log.error('app_update.confirm_failed', error);
      },
    );
  }

  private confirmRequested(): void {
    log.info('app_update.confirm_requested', { state: this.state().kind });
    this.requestRestart();
  }

  listenForConfirmRequests(): () => void {
    return (
      this.deps.adapter.onConfirmRequested?.(() => {
        this.confirmRequested();
      }) ?? ((): void => undefined)
    );
  }

  async restart(): Promise<void> {
    const target = restartableTargetOf(this.state());
    if (target === null) return;
    this.dispatch({ type: 'restart_requested', busy: this.deps.busy() });
    if (this.state().kind !== 'restarting') return;
    const { launchedId } = this.deps.prefs();
    try {
      await this.deps.adapter.restart({
        channel: RELEASE_UPDATE_CHANNEL,
        target,
        onApplying: () => {
          this.deps.changePrefs(launchPrefsOf(target));
        },
      });
    } catch (error) {
      this.deps.changePrefs({ pendingId: null, launchedId });
      this.fail('restart', error, {
        offer: target.kind === 'update' ? target.offer : null,
        keep: target,
      });
    }
  }

  busyChanged(busy: boolean): void {
    const before = this.state().kind;
    this.dispatch({ type: 'busy_changed', busy });
    const target = restartTargetOf(this.state());
    if (before === 'waiting_for_call' && this.state().kind === 'ready' && target?.kind === 'update')
      background(this.restart(), 'app_update.restart_failed');
  }

  receiveNotice(notice: AppUpdateNotice): void {
    const target: NoticeTarget = {
      platform: this.deps.adapter.platform,
      channel: RELEASE_UPDATE_CHANNEL,
      runtimeVersion: this.runtimeVersion,
    };
    if (!noticeMatches(notice, target)) {
      log.debug('app_update.notice_ignored', { platform: notice.platform, id: notice.id });
      return;
    }
    background(this.check('notice'), 'app_update.check_failed', { trigger: 'notice' });
  }
}
