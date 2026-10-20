import {
  paceSecondsPerKm,
  type AdapterSink,
  type BeltLinkPhase,
  type CapabilityKey,
  type JsonValue,
  type PadPreferences,
  type TreadmillFamily,
} from '@smarteverything/domain';
import type { MetricHistory } from '../../metrics/history';
import type { DeviceState } from './fleet';
import type { Snapshot } from './runtime';

const STATE_EVERY_MS = 10_000;

export interface PublisherDeps {
  readonly sink: () => AdapterSink;
  readonly metrics: Pick<MetricHistory, 'push'>;
}

function discreteOf(snapshot: Snapshot): [CapabilityKey, JsonValue][] {
  const { live } = snapshot;
  const values: [CapabilityKey, JsonValue][] = [['belt_state', snapshot.state]];
  if (live.mode !== undefined) {
    values.push(['belt_mode', live.mode]);
  }
  if (live.targetSpeedKmh !== undefined) {
    values.push(['belt_target_speed', live.targetSpeedKmh]);
  }
  if (live.inclinePercent !== undefined) {
    values.push(['belt_incline', live.inclinePercent]);
  }
  if (live.button !== undefined) {
    values.push(['button', live.button]);
  }
  return values;
}

function sampledOf(snapshot: Snapshot, cadence: number | null): [CapabilityKey, number][] {
  const { live } = snapshot;
  const speed = live.speedKmh;
  const pace = speed === undefined ? null : paceSecondsPerKm(speed);
  const values: [CapabilityKey, number | undefined | null][] = [
    ['belt_speed', speed],
    ['session_time', live.timeS],
    ['session_distance', live.distanceM],
    ['session_steps', live.steps],
    ['session_pace', pace],
    ['session_cadence', cadence],
  ];
  return values.flatMap(([key, value]) =>
    value === undefined || value === null ? [] : [[key, value]],
  );
}

function padStates(family: TreadmillFamily, pad: PadPreferences): [CapabilityKey, JsonValue][] {
  const states: [CapabilityKey, JsonValue | undefined][] = [
    ['child_lock', pad.childLock],
    ['belt_max_speed', pad.maxSpeedKmh],
  ];
  if (family === 'wilink') {
    states.push(
      ['belt_goal', pad.goalKind],
      ['belt_goal_value', pad.goalValue],
      ['belt_start_speed', pad.startSpeedKmh],
      ['belt_auto_start', pad.autoStart],
      ['belt_sensitivity', pad.sensitivity],
    );
  }
  if (family === 'ftms_supplement') {
    states.push(['buzzer', pad.buzzer], ['belt_light', pad.light]);
  }
  return states.flatMap(([key, value]) => (value === undefined ? [] : [[key, value]]));
}

export class Publisher {
  constructor(private readonly deps: PublisherDeps) {}

  snapshot(state: DeviceState, snapshot: Snapshot, cadence: number | null): void {
    for (const [key, value] of discreteOf(snapshot)) {
      this.emit(state, key, value, snapshot.at);
    }
    const sampled = sampledOf(snapshot, cadence);
    const when = new Date(snapshot.at);
    for (const [key, value] of sampled) {
      this.deps.metrics.push(state.deviceId, key, value, when);
    }
    if (state.sampleDue(when.getTime(), STATE_EVERY_MS)) {
      for (const [key, value] of sampled) {
        this.emit(state, key, value, snapshot.at);
      }
    }
  }

  pad(state: DeviceState, family: TreadmillFamily, at: string): void {
    for (const [key, value] of padStates(family, state.runtime.pad)) {
      this.emit(state, key, value, at);
    }
  }

  link(state: DeviceState, phase: BeltLinkPhase, at: string): void {
    this.emit(state, 'belt_link', phase, at);
  }

  private emit(state: DeviceState, key: CapabilityKey, value: JsonValue, at: string): void {
    if (state.sent.get(key) === value) {
      return;
    }
    state.sent.set(key, value);
    this.deps.sink().state({
      externalId: state.entry.externalId,
      capability: key,
      value,
      observedAt: at,
    });
  }
}
