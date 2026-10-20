import {
  EMPTY_CLASSIFIER,
  classifyReadings,
  curveFor,
  type ClassifiedRow,
  type ClassifierRow,
  type LogRows,
  type VolumeCurve,
} from '@smarteverything/ble';
import type { BottleReadingKind } from '@smarteverything/domain';
import type {
  BottleReadingsRepository,
  StoredReading,
} from '../../store/repositories/bottle-readings';
import type { BottleEntryConfig } from './config';
import { SNAP, type Snapshots } from './snapshots';

export interface ReadingsDeps {
  readonly readings: BottleReadingsRepository;
  readonly snapshots: Snapshots;
  readonly now: () => Date;
}

type TofRow = LogRows['tof'];

const EVERYTHING = Number.MAX_SAFE_INTEGER;

export function curveOf(config: Pick<BottleEntryConfig, 'body' | 'calibration'>): VolumeCurve {
  return curveFor(config.body, config.calibration?.curve ?? null);
}

function kindOf(row: ClassifiedRow): BottleReadingKind {
  switch (row.event.kind) {
    case 'none':
      return 'rejected';
    case 'seed':
    case 'small':
    case 'drink':
    case 'fill':
      return row.event.kind;
  }
}

function eventMlOf(row: ClassifiedRow): number | null {
  switch (row.event.kind) {
    case 'drink':
      return row.event.ml;
    case 'fill':
      return Math.max(0, row.event.toMl - row.event.fromMl);
    case 'none':
    case 'seed':
    case 'small':
      return null;
  }
}

export function storedOf(row: ClassifiedRow): StoredReading {
  return {
    at: row.row.at,
    trigger: row.row.trigger,
    distanceMm: row.row.distanceMm,
    kcps: row.row.kcps,
    ledOhm: 0,
    verdict: row.verdict,
    volumeMl: row.volumeMl,
    kind: kindOf(row),
    eventMl: eventMlOf(row),
    drunkMl: row.event.kind === 'fill' ? row.event.drunkMl : null,
  };
}

function keyOf(row: {
  readonly at: number;
  readonly trigger: string;
  readonly distanceMm: number;
}): string {
  return `${String(row.at)}|${row.trigger}|${String(row.distanceMm)}`;
}

function ascending(rows: readonly TofRow[]): TofRow[] {
  return [...rows].sort((left, right) => left.at - right.at);
}

function classifierRowOf(row: TofRow): ClassifierRow {
  return { at: row.at, trigger: row.trigger, distanceMm: row.distanceMm, kcps: row.kcps };
}

export interface Incoming {
  readonly rows: readonly ClassifiedRow[];
  readonly replayed: boolean;
}

function freshOf(deps: ReadingsDeps, deviceId: string, tof: readonly TofRow[]): TofRow[] {
  const sorted = ascending(tof);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) {
    return [];
  }
  const known = new Set(
    deps.readings.window(deviceId, { from: first.at, to: last.at }).map((row) => keyOf(row)),
  );
  const seen = new Set<string>();
  return sorted.filter((row) => {
    const key = keyOf(row);
    if (known.has(key) || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function replayAll(
  deps: ReadingsDeps,
  deviceId: string,
  curve: VolumeCurve,
): readonly ClassifiedRow[] {
  const all = deps.readings.all(deviceId);
  const classified = classifyReadings(
    all.map(classifierRowOf),
    curve,
    EMPTY_CLASSIFIER,
    deps.now(),
  );
  classified.rows.forEach((row, index) => {
    const stored = all[index];
    if (stored !== undefined) {
      deps.readings.rederived(deviceId, { ...storedOf(row), ledOhm: stored.ledOhm });
    }
  });
  if (classified.undecided !== null) {
    deps.readings.remove(deviceId, classified.undecided);
  }
  deps.snapshots.save(deviceId, SNAP.classifier, deps.now().toISOString(), classified.state);
  return classified.rows;
}

export function storeIncoming(
  deps: ReadingsDeps,
  deviceId: string,
  curve: VolumeCurve,
  tof: readonly TofRow[],
): Incoming {
  const fresh = freshOf(deps, deviceId, tof);
  const earliest = fresh[0];
  if (earliest === undefined) {
    return { rows: [], replayed: false };
  }
  const newest = deps.readings.newestAt(deviceId, EVERYTHING);
  if (newest !== null && earliest.at < newest) {
    for (const row of fresh) {
      deps.readings.insert(deviceId, {
        at: row.at,
        trigger: row.trigger,
        distanceMm: row.distanceMm,
        kcps: row.kcps,
        ledOhm: row.ledOhm,
        verdict: 'accepted',
        volumeMl: null,
        kind: 'small',
        eventMl: null,
        drunkMl: null,
      });
    }
    return { rows: replayAll(deps, deviceId, curve), replayed: true };
  }
  const state = deps.snapshots.get(deviceId, SNAP.classifier)?.value ?? EMPTY_CLASSIFIER;
  const classified = classifyReadings(fresh.map(classifierRowOf), curve, state, deps.now());
  classified.rows.forEach((row, index) => {
    const source = fresh[index];
    if (source !== undefined) {
      deps.readings.insert(deviceId, { ...storedOf(row), ledOhm: source.ledOhm });
    }
  });
  deps.snapshots.save(deviceId, SNAP.classifier, deps.now().toISOString(), classified.state);
  return { rows: classified.rows, replayed: false };
}
