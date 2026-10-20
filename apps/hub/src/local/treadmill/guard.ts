import { NO_STEPS_SECONDS } from '@smarteverything/domain';
import type { DeviceState } from './fleet';

export class NoStepsGuard {
  private readonly armed = new Map<string, number>();

  arm(deviceId: string, nowMs: number): void {
    this.armed.set(deviceId, nowMs);
  }

  disarm(deviceId: string): void {
    this.armed.delete(deviceId);
  }

  expired(state: DeviceState, nowMs: number): boolean {
    const since = this.armed.get(state.deviceId);
    if (since === undefined) {
      return false;
    }
    const { machine } = state.runtime;
    if ((machine.live.steps ?? 0) > 0 || machine.state === 'idle' || machine.state === 'stopped') {
      this.armed.delete(state.deviceId);
      return false;
    }
    if (machine.state !== 'running') {
      return false;
    }
    if (machine.live.steps === undefined) {
      this.armed.delete(state.deviceId);
      return false;
    }
    return nowMs - since >= NO_STEPS_SECONDS * 1000;
  }
}
