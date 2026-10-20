import { orientationOf } from '@smarteverything/ble';
import {
  BOTTLE_FAULT_TYPES,
  BOTTLE_LOW_BATTERY_PCT,
  bottleChargesFromBattery,
  bottleChargesFromVoltage,
  bottleDayAfter,
  bottleDayOfInstant,
  maskedSerial,
  type BottleBatteryPoint,
  type BottleCharge,
  type BottleCareView,
  type BottleDiagnosticsView,
  type BottleSettingsView,
} from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import { standingOf } from './access';
import { entryConfigOf } from './config';
import { quietOfCap, reminderOfCap } from './convert';
import { filterStatusOf } from './filter';
import { SNAP } from './snapshots';
import { batteryPointsOf, capOf, isoOfSeconds } from './summary';
import { DAY_SECONDS, MS_PER_SECOND, type ViewContext } from './view-deps';
import { goalMlOf } from './water';

const CARE_DAYS = 30;

const MAX_POINTS = 200;

const RECENT_UV = 20;

const FAULT_ROWS = 20;

const SYNC_ROWS = 10;

const LOCKOUT_PCT = 5;

const UV_SAMPLES = 20;

const KCPS_ROWS = 40;

const HISTORY_DAYS = 400;

const NO_INFORMATION = {
  manufacturer: null,
  model: null,
  serial: null,
  firmware: null,
  hardware: null,
  software: null,
} as const;

function nowSeconds(context: ViewContext): number {
  return Math.floor(context.deps.now().getTime() / MS_PER_SECOND);
}

function filterOf(context: ViewContext, entry: LocalDeviceEntry): BottleCareView['filter'] {
  const { deps, device } = context;
  const now = deps.now();
  return filterStatusOf(
    deps.readings,
    { deviceId: device.id, now, today: deps.clock.dayOf(now) },
    entryConfigOf(entry),
  );
}

function downsampled(points: readonly BottleBatteryPoint[]): BottleBatteryPoint[] {
  if (points.length <= MAX_POINTS) {
    return [...points];
  }
  const step = Math.ceil(points.length / MAX_POINTS);
  return points.filter((_, index) => index % step === 0 || index === points.length - 1);
}

function uvDaysOf(context: ViewContext, today: string): BottleCareView['uvDays'] {
  const { deps, device } = context;
  const to = nowSeconds(context);
  const rows = deps.logs.uv(device.id, { from: to - CARE_DAYS * DAY_SECONDS, to });
  const offset = deps.clock.offsetOf(deps.now());
  const counts = new Map<string, { maintenance: number; normal: number; adventure: number }>();
  for (const row of rows) {
    const day = bottleDayOfInstant(isoOfSeconds(row.at), offset);
    const sums = counts.get(day) ?? { maintenance: 0, normal: 0, adventure: 0 };
    if (row.mode === 'maintenance' || row.mode === 'normal' || row.mode === 'adventure') {
      sums[row.mode] += 1;
    }
    counts.set(day, sums);
  }
  const none = { maintenance: 0, normal: 0, adventure: 0 };
  return Array.from({ length: CARE_DAYS }, (_, index) => {
    const day = bottleDayAfter(today, index + 1 - CARE_DAYS);
    return { day, ...(counts.get(day) ?? none) };
  });
}

function chargesOf(context: ViewContext, points: readonly BottleBatteryPoint[]): BottleCharge[] {
  const { deps, device } = context;
  const to = nowSeconds(context);
  const rows = deps.logs.adc(device.id, 'charging', { from: to - CARE_DAYS * DAY_SECONDS, to });
  if (rows.length === 0) {
    return bottleChargesFromBattery(points);
  }
  const levelAt = (instantMs: number): number | null =>
    [...points].reverse().find((point) => Date.parse(point.at) <= instantMs)?.pct ?? null;
  return bottleChargesFromVoltage(
    rows.map((row) => ({ at: row.at * MS_PER_SECOND, volt: row.batteryVolt })),
    levelAt,
  );
}

function batteryBlock(context: ViewContext): BottleCareView['battery'] {
  const { deps, device } = context;
  const cap = capOf(deps, device.id);
  const points = batteryPointsOf(deps, device.id);
  const low = deps.snapshots.get(device.id, SNAP.lowBattery)?.value;
  const to = nowSeconds(context);
  const history = deps.logs
    .battery(device.id, { from: to - HISTORY_DAYS * DAY_SECONDS, to })
    .map((row) => ({ at: isoOfSeconds(row.at), pct: row.pct }));
  return {
    pct: cap.batteryPct,
    alertPct: low?.alertPct ?? BOTTLE_LOW_BATTERY_PCT,
    lockoutPct: low?.lockoutPct ?? LOCKOUT_PCT,
    points: downsampled(points),
    charges: chargesOf(context, points),
    chargeCycles: bottleChargesFromBattery(history).length,
    daysLeft: cap.daysLeft,
  };
}

export function careView(context: ViewContext, entry: LocalDeviceEntry): BottleCareView {
  const { deps, device } = context;
  const today = deps.clock.dayOf(deps.now());
  const to = nowSeconds(context);
  const active = capOf(deps, device.id).fault !== null;
  return {
    view: 'care',
    uvDays: uvDaysOf(context, today),
    uvRecent: deps.logs
      .uv(device.id, { from: to - CARE_DAYS * DAY_SECONDS, to })
      .slice(-RECENT_UV)
      .reverse()
      .map((row) => ({ at: isoOfSeconds(row.at), mode: row.mode, socPct: row.socPct })),
    battery: batteryBlock(context),
    filter: filterOf(context, entry),
    faults: deps.logs.faults(device.id, FAULT_ROWS).map((fault, index) => ({
      at: isoOfSeconds(fault.at),
      type: fault.type,
      known: BOTTLE_FAULT_TYPES.some((type) => type === fault.type),
      active: active && index === 0,
    })),
  };
}

function holderOf(context: ViewContext): BottleSettingsView['holder'] {
  const holder = context.deps.holder(context.device);
  return holder === null
    ? null
    : { name: holder.clientName, isYou: holder.clientId === context.viewer.clientId };
}

export function settingsView(context: ViewContext, entry: LocalDeviceEntry): BottleSettingsView {
  const { deps, device, viewer } = context;
  const config = entryConfigOf(entry);
  const person =
    config.binding.profileId === null ? null : deps.store.profiles.byId(config.binding.profileId);
  const reminder = deps.snapshots.get(device.id, SNAP.reminder);
  const quiet = deps.snapshots.get(device.id, SNAP.quiet);
  const may = standingOf(viewer, config) !== 'none';
  return {
    view: 'settings',
    deviceId: device.id,
    name: device.display_name ?? device.name,
    room: config.room,
    person: person === null ? null : { id: person.id, name: person.name },
    body: config.body,
    goalMl: goalMlOf(person ?? deps.store.profiles.byId(viewer.profileId)),
    reminder: reminder === undefined ? null : reminderOfCap(reminder.value),
    quiet: quiet === undefined ? null : quietOfCap(quiet.value),
    pending: config.desired,
    filterConfig: config.filter,
    filter: filterOf(context, entry),
    calibration: calibrationOf(config.calibration),
    holder: holderOf(context),
    syncs: deps.logs.syncs(device.id, SYNC_ROWS).map((sync) => ({
      startedAt: sync.startedAt,
      endedAt: sync.endedAt,
      trigger: sync.cause,
      outcome: sync.outcome,
      detail: sync.detail,
      requests: sync.requests,
      answered: sync.answered,
      rssi: sync.rssi,
    })),
    mayEdit: may,
    mayBind: may,
  };
}

function calibrationOf(
  calibration: ReturnType<typeof entryConfigOf>['calibration'],
): BottleSettingsView['calibration'] {
  return calibration === null
    ? null
    : {
        fittedAt: calibration.fittedAt,
        rmseMl: calibration.rmseMl,
        points: calibration.points.length,
      };
}

export function diagnosticsView(
  context: ViewContext,
  entry: LocalDeviceEntry,
): BottleDiagnosticsView {
  const { deps, device } = context;
  const information = deps.snapshots.get(device.id, SNAP.dis)?.value ?? NO_INFORMATION;
  const oldest = deps.readings.oldestAt(device.id);
  return {
    view: 'diagnostics',
    device: {
      manufacturer: information.manufacturer,
      model: information.model,
      serial: maskedSerial(entry.address),
      firmware: information.firmware,
      hardware: information.hardware,
      software: information.software,
      historyFrom: oldest === null ? null : isoOfSeconds(oldest),
    },
    signal: {
      rssi: deps.logs.syncs(device.id, 1)[0]?.rssi ?? null,
      kcps: deps.readings.recentKcps(device.id, KCPS_ROWS),
    },
    clockDriftSeconds: deps.snapshots.get(device.id, SNAP.timeDrift)?.value.driftSeconds ?? null,
    ...sensorsOf(context),
    quality: deps.readings.qualityCounts(device.id),
    capSettings: capSettingsOf(context),
    uvLed: uvLedOf(context),
    unsupported: entryConfigOf(entry).unsupported.requests,
    lid: lidOf(context),
    presence: presenceOf(context),
  };
}

function textOf<T>(
  read: { readonly at: string; readonly value: T } | undefined,
  format: (value: T) => string,
): { text: string; at: string } | null {
  return read === undefined ? null : { text: format(read.value), at: read.at };
}

function sensorsOf(context: ViewContext): Pick<BottleDiagnosticsView, 'orientation' | 'sensors'> {
  const { deps, device } = context;
  const get = deps.snapshots;
  return {
    orientation: textOf(
      get.get(device.id, SNAP.orientation),
      (v) =>
        `${orientationOf(v).replace('_', ' ')} · x ${v.x.toFixed(2)} y ${v.y.toFixed(2)} z ${v.z.toFixed(2)} g`,
    ),
    sensors: {
      ambient: textOf(get.get(device.id, SNAP.ambient), (v) => `${v.lux.toFixed(0)} lux`),
      lid: textOf(get.get(device.id, SNAP.hall), (v) => (v.closed ? 'Closed' : 'Open')),
      sip: textOf(get.get(device.id, SNAP.sip), (v) => (v.active ? 'Touched' : 'Not touched')),
      seated: textOf(get.get(device.id, SNAP.seated), (v) => (v.active ? 'Seated' : 'Not seated')),
    },
  };
}

type SettingRow = BottleDiagnosticsView['capSettings'][number];

function levelRows(context: ViewContext): SettingRow[] {
  const { deps, device } = context;
  const tof = deps.snapshots.get(device.id, SNAP.tofSettings)?.value;
  const low = deps.snapshots.get(device.id, SNAP.lowBattery)?.value;
  return [
    ...(tof === undefined
      ? []
      : [
          { label: 'Level mode', value: tof.mode },
          { label: 'Bottle size reported', value: `${String(tof.bottleSizeMl)} ml` },
        ]),
    ...(low === undefined
      ? []
      : [
          { label: 'Low battery alert', value: `${String(low.alertPct)}%` },
          { label: 'Lockout', value: `${String(low.lockoutPct)}%` },
        ]),
  ];
}

function uvRows(context: ViewContext): SettingRow[] {
  const { deps, device } = context;
  const uv = deps.snapshots.get(device.id, SNAP.uvConfig)?.value;
  return uv === undefined
    ? []
    : [
        {
          label: 'UV Normal',
          value: `${String(uv.normal.cycle)} · ${String(uv.normal.currentMa)} mA`,
        },
        {
          label: 'UV Adventure',
          value: `${String(uv.adventure.cycle)} · ${String(uv.adventure.currentMa)} mA`,
        },
      ];
}

function miscRows(context: ViewContext): SettingRow[] {
  const { deps, device } = context;
  const timeout = deps.snapshots.get(device.id, SNAP.calibrationTimeout)?.value;
  const state = deps.snapshots.get(device.id, SNAP.uiState)?.value;
  return [
    ...(timeout === undefined
      ? []
      : [{ label: 'Calibration timeout', value: `${String(timeout.timeoutSeconds)} s` }]),
    ...(state === undefined ? [] : [{ label: 'Power saving', value: state.powerSaving }]),
  ];
}

function capSettingsOf(context: ViewContext): SettingRow[] {
  return [...levelRows(context), ...uvRows(context), ...miscRows(context)];
}

function uvLedOf(context: ViewContext): BottleDiagnosticsView['uvLed'] {
  const { deps, device } = context;
  const to = nowSeconds(context);
  const rows = deps.logs
    .adc(device.id, 'activation', { from: to - CARE_DAYS * DAY_SECONDS, to })
    .slice(-UV_SAMPLES);
  return {
    currentMa: rows.map((row) => row.uvLedMa),
    volt: rows.map((row) => row.uvLedVolt),
    ohm: rows.map((row) => row.uvLedOhm),
  };
}

function lidOf(context: ViewContext): BottleDiagnosticsView['lid'] {
  const { deps, device } = context;
  const to = nowSeconds(context);
  const rows = deps.logs.states(device.id, { from: to - DAY_SECONDS, to });
  return rows.flatMap((row, index) => {
    const next = rows[index + 1];
    return !row.hall && next !== undefined
      ? [{ from: isoOfSeconds(row.at), to: isoOfSeconds(next.at) }]
      : [];
  });
}

function presenceOf(context: ViewContext): BottleDiagnosticsView['presence'] {
  const { deps, device } = context;
  const since = new Date(deps.now().getTime() - DAY_SECONDS * MS_PER_SECOND).toISOString();
  return deps.logs
    .syncsSince(device.id, since)
    .filter((sync) => sync.outcome !== 'asleep')
    .map((sync) => ({ from: sync.startedAt, to: sync.endedAt }));
}
