import {
  vacuumJob,
  vacuumMode,
  vacuumScope,
  vacuumValuesOf,
  type CapabilityRole,
  type DeviceEvent,
  type DeviceRow,
  type JsonValue,
  type StateChange,
  type VacuumClean,
  type VacuumScene,
  type VacuumValues,
} from '@smarteverything/domain';
import type { DeviceRecord } from '../database/port';
import {
  closedOf,
  draftOf,
  finishedEventOf,
  refreshedOf,
  resultsOf,
  startedEventOf,
} from './clean-record';
import {
  endingOf,
  isResumablePhase,
  isSessionPhase,
  isSweepComplete,
  keepsSession,
  phaseOf,
  sameJob,
  startKey,
  startsClean,
  taskKey,
  type CleanOutcome,
} from './clean-session';
import {
  FACT_ROLES,
  RESULT_ROLES,
  trackedOf,
  type CleanMap,
  type CleanTrackerPorts,
  type Tracked,
} from './clean-tracked';
import { cloudRecordOf, isRecordOf, recordedOf } from './cloud-record';

interface Live {
  readonly clean: VacuumClean;
  readonly adopting: { readonly baseTask: number | null } | null;
}

interface Settling {
  readonly clean: VacuumClean;
  readonly reported: boolean;
  readonly trailPending: boolean;
}

export class VacuumCleanTracker {
  private readonly tracked = new Map<
    string,
    { readonly updatedAt: string; readonly vacuum: Tracked | null }
  >();
  private readonly live = new Map<string, Live>();
  private readonly settling = new Map<string, Settling>();

  constructor(private readonly ports: CleanTrackerPorts) {}

  observe(change: StateChange): void {
    try {
      this.apply(change);
    } catch (cause) {
      this.ports.log.error('vacuum_clean.change_failed', cause, {
        deviceId: change.deviceId,
        capability: change.capability,
      });
    }
  }

  claim(device: DeviceRecord, event: DeviceEvent): boolean {
    if (!isSweepComplete(event)) return false;
    try {
      return this.sweepComplete(device, event);
    } catch (cause) {
      this.ports.log.error('vacuum_clean.event_failed', cause, { deviceId: device.id });
      return false;
    }
  }

  resume(deviceId: string): void {
    try {
      this.reconcile(deviceId);
    } catch (cause) {
      this.ports.log.error('vacuum_clean.resume_failed', cause, { deviceId });
    }
  }

  scenePublished(deviceId: string, scene: VacuumScene): void {
    try {
      this.publish(deviceId, scene);
    } catch (cause) {
      this.ports.log.error('vacuum_clean.scene_failed', cause, { deviceId });
    }
  }

  private apply(change: StateChange): void {
    const vacuum = this.vacuumOf(change.deviceId);
    const role = vacuum?.roles.get(change.capability);
    if (vacuum === null || role === undefined) return;
    if (role === 'vacuum_status') {
      this.status(vacuum, change.previous, change.value);
    } else if (role === 'vacuum_cloud_records') {
      this.cloudRecord(vacuum, change.value);
    } else {
      this.sustain(vacuum, role);
    }
  }

  private vacuumOf(deviceId: string): Tracked | null {
    const device = this.ports.device(deviceId);
    if (device === undefined) {
      this.tracked.delete(deviceId);
      return null;
    }
    const known = this.tracked.get(deviceId);
    if (known?.updatedAt === device.updated_at) return known.vacuum;
    const vacuum = trackedOf(device);
    this.tracked.set(deviceId, { updatedAt: device.updated_at, vacuum });
    return vacuum;
  }

  private values(vacuum: Tracked): VacuumValues {
    return vacuumValuesOf(vacuum.sources, (key) => this.ports.value(vacuum.device.id, key));
  }

  private phase(vacuum: Tracked): ReturnType<typeof phaseOf> {
    const key = vacuum.keys.get('vacuum_status');
    return phaseOf(key === undefined ? undefined : this.ports.value(vacuum.device.id, key));
  }

  private status(vacuum: Tracked, previous: JsonValue | undefined, value: JsonValue): void {
    const phase = phaseOf(value);
    const live = this.live.get(vacuum.device.id);
    if (live === undefined) {
      if (startsClean(phaseOf(previous), phase)) {
        this.start(vacuum);
      } else if (isResumablePhase(phase)) {
        this.reopen(vacuum);
      }
      return;
    }
    if (!isSessionPhase(phase) && !keepsSession(value)) {
      this.close(vacuum, live, endingOf(previous, phase));
    }
  }

  private sustain(vacuum: Tracked, role: CapabilityRole): void {
    const deviceId = vacuum.device.id;
    const live = this.live.get(deviceId);
    if (live !== undefined) {
      if (FACT_ROLES.has(role)) this.refresh(vacuum, live);
    } else if (RESULT_ROLES.has(role)) {
      this.late(vacuum);
    } else if (isResumablePhase(this.phase(vacuum))) {
      this.reopen(vacuum);
    }
  }

  private reconcile(deviceId: string): void {
    const vacuum = this.vacuumOf(deviceId);
    if (vacuum === null || this.live.has(deviceId)) return;
    if (isResumablePhase(this.phase(vacuum))) {
      this.reopen(vacuum);
      return;
    }
    const stored = this.ports.cleans.open(deviceId);
    if (stored !== undefined) this.endStale(vacuum, stored, true);
  }

  private start(vacuum: Tracked): void {
    const deviceId = vacuum.device.id;
    this.settleBefore(vacuum);
    const stored = this.ports.cleans.open(deviceId);
    if (stored !== undefined) this.endStale(vacuum, stored, false);
    const map = this.ports.map(deviceId);
    const startedAt = this.ports.now().toISOString();
    const clean = draftOf(this.values(vacuum), map.rooms, { id: startKey(startedAt), startedAt });
    this.ports.cleans.save(deviceId, clean);
    this.live.set(deviceId, { clean, adopting: { baseTask: map.taskId } });
    this.ports.record(vacuum.device.provider, startedEventOf(vacuum.device.external_id, clean));
    this.ports.log.info('vacuum_clean.started', { deviceId, cleanId: clean.id });
  }

  private reopen(vacuum: Tracked): void {
    const deviceId = vacuum.device.id;
    this.settleBefore(vacuum);
    const stored = this.ports.cleans.open(deviceId);
    const map = this.ports.map(deviceId);
    if (stored !== undefined && this.continues(vacuum, stored, map)) {
      this.live.set(deviceId, { clean: stored, adopting: null });
      this.ports.log.info('vacuum_clean.reopened', { deviceId, cleanId: stored.id });
      return;
    }
    if (stored !== undefined) this.endStale(vacuum, stored, false);
    const startedAt = this.ports.now().toISOString();
    const adopted = this.freshTask(deviceId, map.taskId);
    const id = adopted === null ? startKey(startedAt) : taskKey(adopted);
    const clean = draftOf(this.values(vacuum), map.rooms, { id, startedAt });
    this.ports.cleans.save(deviceId, clean);
    this.live.set(deviceId, { clean, adopting: null });
    this.ports.record(vacuum.device.provider, startedEventOf(vacuum.device.external_id, clean));
    this.ports.log.info('vacuum_clean.joined', { deviceId, cleanId: id });
  }

  private freshTask(deviceId: string, taskId: number | null): number | null {
    return taskId !== null && this.ports.cleans.get(deviceId, taskKey(taskId)) === undefined
      ? taskId
      : null;
  }

  private continues(vacuum: Tracked, stored: VacuumClean, map: CleanMap): boolean {
    if (map.taskId !== null && stored.id.startsWith('task-')) {
      return stored.id === taskKey(map.taskId);
    }
    const values = this.values(vacuum);
    return sameJob(stored, vacuumScope(values), vacuumMode(values), vacuumJob(values));
  }

  private endStale(vacuum: Tracked, stored: VacuumClean, measured: boolean): void {
    const endedAt = this.ports.now().toISOString();
    const ended = { ...stored, endedAt, outcome: null };
    this.ports.cleans.save(
      vacuum.device.id,
      measured ? resultsOf(ended, this.values(vacuum)) : ended,
    );
    this.ports.log.warn('vacuum_clean.ended_unseen', {
      deviceId: vacuum.device.id,
      cleanId: stored.id,
    });
  }

  private close(vacuum: Tracked, live: Live, ending: ReturnType<typeof endingOf>): void {
    const deviceId = vacuum.device.id;
    const endedAt = this.ports.now().toISOString();
    const clean = closedOf(live.clean, this.values(vacuum), { endedAt, outcome: ending.outcome });
    this.ports.cleans.save(deviceId, clean);
    this.live.delete(deviceId);
    this.settling.set(deviceId, {
      clean,
      reported: ending.outcome !== null,
      trailPending: true,
    });
    this.ports.log.info('vacuum_clean.ended', { deviceId, cleanId: clean.id, ...ending });
    if (ending.outcome !== null) this.report(vacuum.device, clean, ending.outcome, null);
  }

  private sweepComplete(device: DeviceRecord, event: DeviceEvent): boolean {
    const vacuum = this.vacuumOf(device.id);
    if (vacuum === null) return false;
    const live = this.live.get(device.id);
    const settled = this.settling.get(device.id);
    if (live === undefined && settled?.reported === true) {
      this.ports.log.info('vacuum_clean.report_after_finish', { deviceId: device.id });
      return true;
    }
    const open = live?.clean ?? settled?.clean;
    if (open === undefined) {
      this.ports.log.info('vacuum_clean.report_unmatched', { deviceId: device.id });
      return false;
    }
    const endedAt = this.ports.now().toISOString();
    const clean =
      live === undefined
        ? { ...open, outcome: 'finished' }
        : closedOf(open, this.values(vacuum), { endedAt, outcome: 'finished' });
    this.live.delete(device.id);
    this.settling.set(device.id, { clean, reported: true, trailPending: true });
    this.ports.cleans.save(device.id, clean);
    this.report(vacuum.device, clean, 'finished', event);
    return true;
  }

  private settleBefore(vacuum: Tracked): void {
    const deviceId = vacuum.device.id;
    const settled = this.settling.get(deviceId);
    this.settling.delete(deviceId);
    if (settled === undefined || settled.reported) return;
    const clean = { ...settled.clean, outcome: 'stopped' };
    this.ports.cleans.save(deviceId, clean);
    this.report(vacuum.device, clean, 'stopped', null);
    this.ports.log.info('vacuum_clean.report_missing', { deviceId, cleanId: clean.id });
  }

  private cloudRecord(vacuum: Tracked, value: JsonValue): void {
    const record = cloudRecordOf(value);
    if (record === null) return;
    const deviceId = vacuum.device.id;
    const settled = this.settling.get(deviceId);
    if (settled === undefined || !isRecordOf(record, settled.clean)) {
      this.ports.log.info('vacuum_clean.record_unmatched', { deviceId });
      return;
    }
    const clean = recordedOf(settled.clean, record);
    const { outcome } = record;
    this.ports.cleans.save(deviceId, clean);
    this.settling.set(deviceId, {
      ...settled,
      clean,
      reported: settled.reported || outcome !== null,
    });
    this.ports.log.info('vacuum_clean.recorded', { deviceId, cleanId: clean.id });
    if (!settled.reported && outcome !== null) this.report(vacuum.device, clean, outcome, null);
  }

  private late(vacuum: Tracked): void {
    const settled = this.settling.get(vacuum.device.id);
    if (settled === undefined) return;
    const clean = resultsOf(settled.clean, this.values(vacuum));
    this.ports.cleans.save(vacuum.device.id, clean);
    this.settling.set(vacuum.device.id, { ...settled, clean });
  }

  private refresh(vacuum: Tracked, live: Live): void {
    const names = this.ports.map(vacuum.device.id).rooms;
    const clean = refreshedOf(live.clean, this.values(vacuum), names);
    this.live.set(vacuum.device.id, { ...live, clean });
    this.ports.cleans.save(vacuum.device.id, clean);
  }

  private publish(deviceId: string, scene: VacuumScene): void {
    if (scene.slot !== 'current') return;
    const live = this.live.get(deviceId);
    if (live !== undefined) {
      this.liveScene(deviceId, live, scene);
      return;
    }
    const settled = this.settling.get(deviceId);
    if (settled?.trailPending !== true) return;
    const clean = { ...settled.clean, mapIndex: scene.index, trail: scene.trail };
    this.ports.cleans.save(deviceId, clean);
    this.settling.set(deviceId, { ...settled, clean, trailPending: false });
  }

  private liveScene(deviceId: string, live: Live, scene: VacuumScene): void {
    const adopted = this.adoptedTask(deviceId, live);
    const id = adopted === null ? live.clean.id : taskKey(adopted);
    if (adopted !== null) {
      this.ports.cleans.rename(deviceId, live.clean.id, id);
      this.ports.log.info('vacuum_clean.task_adopted', { deviceId, cleanId: id });
    }
    const clean = { ...live.clean, id, mapIndex: scene.index, trail: scene.trail };
    this.live.set(deviceId, { clean, adopting: adopted === null ? live.adopting : null });
  }

  private adoptedTask(deviceId: string, live: Live): number | null {
    if (live.adopting === null) return null;
    const { taskId } = this.ports.map(deviceId);
    return taskId === live.adopting.baseTask ? null : this.freshTask(deviceId, taskId);
  }

  private report(
    device: DeviceRow,
    clean: VacuumClean,
    outcome: CleanOutcome,
    sweepComplete: DeviceEvent | null,
  ): void {
    this.ports.record(
      device.provider,
      finishedEventOf(device.external_id, clean, outcome, sweepComplete),
    );
  }
}
