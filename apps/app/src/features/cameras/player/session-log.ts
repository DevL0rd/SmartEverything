import { Logger } from '@smarteverything/logging';
import type { SessionPhase } from './player-state';

const log = new Logger('app.camera-sessions');

export interface SessionTrace {
  readonly deviceId: string;
  readonly transport: string;
  readonly sinceBeganMs: number;
}

export function phaseChanged(trace: SessionTrace, phase: SessionPhase): void {
  log.info('camera.phase_changed', { ...trace, phase: phase.kind });
}

export function connectionTimedOut(trace: SessionTrace, phase: string, limitMs: number): void {
  log.warn('camera.connection_timed_out', { ...trace, phase, limitMs });
}

export function videoMissing(trace: SessionTrace, waitedMs: number): void {
  log.warn('camera.video_missing', { ...trace, waitedMs });
}

export function videoFlow(trace: SessionTrace, flowing: boolean): void {
  log.debug('camera.video_flow_changed', () => ({ ...trace, flowing }));
}

export function linkAttached(trace: SessionTrace): void {
  log.debug('camera.link_attached', () => ({ ...trace }));
}

export function recoverSkipped(deviceId: string, reason: string, error: string): void {
  log.debug('camera.recover_skipped', { deviceId, reason, error });
}

export function restartSkipped(deviceId: string, reason: string): void {
  log.debug('camera.restart_skipped', { deviceId, reason });
}

export function sessionStopping(deviceId: string, users: number, linked: boolean): void {
  log.debug('camera.session_stopping', { deviceId, users, linked });
}

export function retryScheduled(deviceId: string, attempt: number, delayMs: number): void {
  log.debug('camera.retry_scheduled', { deviceId, attempt, delayMs });
}
