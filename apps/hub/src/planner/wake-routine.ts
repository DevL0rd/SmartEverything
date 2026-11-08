import type { PlannerAlarmRow } from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';

const MINUTE_MS = 60_000;

export type SceneRunner = (sceneId: string, profileId: string) => Promise<void>;

export interface WakeRoutineOptions {
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly runScene: SceneRunner;
  readonly log: Logger;
}

interface Armed {
  readonly key: string;
  readonly cancel: Cancel;
}

export function wakeLeadAt(alarm: PlannerAlarmRow, ringAt: Date): Date | null {
  if (alarm.wake_scene_id === null || alarm.wake_lead_minutes === null) {
    return null;
  }
  return new Date(ringAt.getTime() - alarm.wake_lead_minutes * MINUTE_MS);
}

export class WakeRoutine {
  private readonly armed = new Map<string, Armed>();

  constructor(private readonly options: WakeRoutineOptions) {}

  arm(alarm: PlannerAlarmRow, ringAt: Date): void {
    const sceneId = alarm.wake_scene_id;
    const leadAt = wakeLeadAt(alarm, ringAt);
    if (
      sceneId === null ||
      leadAt === null ||
      leadAt.getTime() <= this.options.clock.now().getTime()
    ) {
      this.cancel(alarm.id);
      return;
    }
    const key = `${sceneId}|${leadAt.toISOString()}`;
    if (this.armed.get(alarm.id)?.key === key) {
      return;
    }
    this.cancel(alarm.id);
    const cancel = this.options.clock.at(leadAt, () => {
      this.armed.delete(alarm.id);
      this.run(sceneId, alarm);
    });
    this.armed.set(alarm.id, { key, cancel });
  }

  cancel(alarmId: string): void {
    this.armed.get(alarmId)?.cancel();
    this.armed.delete(alarmId);
  }

  cancelAll(): void {
    for (const alarmId of [...this.armed.keys()]) {
      this.cancel(alarmId);
    }
  }

  private run(sceneId: string, alarm: PlannerAlarmRow): void {
    this.options.log.info('planner.wake_routine', { alarmId: alarm.id, sceneId });
    background(this.options.runScene(sceneId, alarm.profile_id), 'planner.wake_routine_failed');
  }
}
