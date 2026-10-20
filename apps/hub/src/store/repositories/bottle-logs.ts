import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import { SQL_JSON, flag, jsonText } from '../sql';

const COUNT = z.number().int().nonnegative();

const UV = z
  .object({ at: COUNT, mode: z.string(), soc_pct: COUNT })
  .transform((row) => ({ at: row.at, mode: row.mode, socPct: row.soc_pct }));

export interface StoredUv {
  readonly at: number;
  readonly mode: string;
  readonly socPct: number;
}

const FAULT = z.object({ at: COUNT, type: z.string() });

interface StoredFault {
  readonly at: number;
  readonly type: string;
}

const BATTERY = z.object({ at: COUNT, pct: COUNT, source: z.enum(['read', 'notify', 'uv_cycle']) });

interface StoredBattery {
  readonly at: number;
  readonly pct: number;
  readonly source: 'read' | 'notify' | 'uv_cycle';
}

const STATE_ROW = z
  .object({
    at: COUNT,
    hall: z.number(),
    bottle: z.number(),
    ambient: z.number(),
    sip: z.number(),
    bottle_value: z.number(),
    ambient_value: z.number(),
    sip_value: z.number(),
  })
  .transform((row) => ({
    at: row.at,
    hall: row.hall === 1,
    bottle: row.bottle === 1,
    ambient: row.ambient === 1,
    sip: row.sip === 1,
    bottleValue: row.bottle_value,
    ambientValue: row.ambient_value,
    sipValue: row.sip_value,
  }));

interface StoredStateRow {
  readonly at: number;
  readonly hall: boolean;
  readonly bottle: boolean;
  readonly ambient: boolean;
  readonly sip: boolean;
  readonly bottleValue: number;
  readonly ambientValue: number;
  readonly sipValue: number;
}

const ADC = z
  .object({
    at: COUNT,
    battery_volt: z.number(),
    battery_ohm: z.number(),
    uv_volt: z.number(),
    uv_ma: z.number(),
    uv_ohm: z.number(),
    pcb_ohm: z.number(),
  })
  .transform((row) => ({
    at: row.at,
    batteryVolt: row.battery_volt,
    batteryOhm: row.battery_ohm,
    uvLedVolt: row.uv_volt,
    uvLedMa: row.uv_ma,
    uvLedOhm: row.uv_ohm,
    pcbOhm: row.pcb_ohm,
  }));

interface StoredAdc {
  readonly at: number;
  readonly batteryVolt: number;
  readonly batteryOhm: number;
  readonly uvLedVolt: number;
  readonly uvLedMa: number;
  readonly uvLedOhm: number;
  readonly pcbOhm: number;
}

const SNAPSHOT = z
  .object({ at: z.string(), value: SQL_JSON.pipe(JSON_VALUE) })
  .transform((row) => ({ at: row.at, value: row.value }));

interface StoredSnapshot {
  readonly at: string;
  readonly value: JsonValue;
}

const SYNC = z
  .object({
    started_at: z.string(),
    ended_at: z.string(),
    cause: z.string(),
    outcome: z.string(),
    detail: z.string().nullable(),
    requests: COUNT,
    answered: COUNT,
    rssi: z.number().nullable(),
    client_id: z.string().nullable(),
  })
  .transform((row) => ({
    startedAt: row.started_at,
    endedAt: row.ended_at,
    cause: row.cause,
    outcome: row.outcome,
    detail: row.detail,
    requests: row.requests,
    answered: row.answered,
    rssi: row.rssi,
    clientId: row.client_id,
  }));

interface StoredSync {
  readonly startedAt: string;
  readonly endedAt: string;
  readonly cause: string;
  readonly outcome: string;
  readonly detail: string | null;
  readonly requests: number;
  readonly answered: number;
  readonly rssi: number | null;
  readonly clientId: string | null;
}

const EXTREME = z.object({ at: COUNT.nullable() });

type AdcKind = 'activation' | 'charging';

interface AtWindow {
  readonly from: number;
  readonly to: number;
}

export class BottleLogsRepository {
  constructor(private readonly context: StoreContext) {}

  addUv(deviceId: string, row: StoredUv): void {
    this.context.sql.run(
      'save the UV cycle',
      `insert or ignore into bottle_uv_cycles (device_id, at, mode, soc_pct)
       values ($deviceId, $at, $mode, $soc)`,
      { deviceId, at: row.at, mode: row.mode, soc: row.socPct },
    );
  }

  uv(deviceId: string, window: AtWindow): StoredUv[] {
    return this.context.sql.all(
      UV,
      `select at, mode, soc_pct from bottle_uv_cycles
       where device_id = $deviceId and at >= $from and at <= $to order by at`,
      { deviceId, from: window.from, to: window.to },
    );
  }

  newestUv(deviceId: string): StoredUv | undefined {
    return this.context.sql.get(
      UV,
      `select at, mode, soc_pct from bottle_uv_cycles where device_id = $deviceId
       order by at desc limit 1`,
      { deviceId },
    );
  }

  newestUvAt(deviceId: string, notAfter: number): number | null {
    return this.newest('bottle_uv_cycles', deviceId, notAfter);
  }

  addFault(deviceId: string, row: StoredFault): boolean {
    return (
      this.context.sql.run(
        'save the fault',
        'insert or ignore into bottle_faults (device_id, at, type) values ($deviceId, $at, $type)',
        { deviceId, at: row.at, type: row.type },
      ) > 0
    );
  }

  faults(deviceId: string, limit: number): StoredFault[] {
    return this.context.sql.all(
      FAULT,
      'select at, type from bottle_faults where device_id = $deviceId order by at desc limit $limit',
      { deviceId, limit },
    );
  }

  newestFaultAt(deviceId: string, notAfter: number): number | null {
    return this.newest('bottle_faults', deviceId, notAfter);
  }

  addBattery(deviceId: string, row: StoredBattery): void {
    this.context.sql.run(
      'save the battery level',
      `insert or ignore into bottle_battery (device_id, at, pct, source)
       values ($deviceId, $at, $pct, $source)`,
      { deviceId, at: row.at, pct: row.pct, source: row.source },
    );
  }

  battery(deviceId: string, window: AtWindow): StoredBattery[] {
    return this.context.sql.all(
      BATTERY,
      `select at, pct, source from bottle_battery
       where device_id = $deviceId and at >= $from and at <= $to order by at, source`,
      { deviceId, from: window.from, to: window.to },
    );
  }

  newestBattery(deviceId: string): StoredBattery | undefined {
    return this.context.sql.get(
      BATTERY,
      `select at, pct, source from bottle_battery where device_id = $deviceId
       order by at desc, source limit 1`,
      { deviceId },
    );
  }

  addState(deviceId: string, row: StoredStateRow): void {
    this.context.sql.run(
      'save the cap state row',
      `insert or ignore into bottle_state_log (device_id, at, hall, bottle, ambient, sip,
         bottle_value, ambient_value, sip_value)
       values ($deviceId, $at, $hall, $bottle, $ambient, $sip, $bottleValue, $ambientValue, $sipValue)`,
      {
        deviceId,
        at: row.at,
        hall: flag(row.hall),
        bottle: flag(row.bottle),
        ambient: flag(row.ambient),
        sip: flag(row.sip),
        bottleValue: row.bottleValue,
        ambientValue: row.ambientValue,
        sipValue: row.sipValue,
      },
    );
  }

  states(deviceId: string, window: AtWindow): StoredStateRow[] {
    return this.context.sql.all(
      STATE_ROW,
      `select at, hall, bottle, ambient, sip, bottle_value, ambient_value, sip_value
       from bottle_state_log where device_id = $deviceId and at >= $from and at <= $to order by at`,
      { deviceId, from: window.from, to: window.to },
    );
  }

  newestStateAt(deviceId: string, notAfter: number): number | null {
    return this.newest('bottle_state_log', deviceId, notAfter);
  }

  addAdc(deviceId: string, kind: AdcKind, row: StoredAdc): void {
    this.context.sql.run(
      'save the cap electrical row',
      `insert or ignore into bottle_adc (device_id, kind, at, battery_volt, battery_ohm, uv_volt,
         uv_ma, uv_ohm, pcb_ohm)
       values ($deviceId, $kind, $at, $batteryVolt, $batteryOhm, $uvVolt, $uvMa, $uvOhm, $pcbOhm)`,
      {
        deviceId,
        kind,
        at: row.at,
        batteryVolt: row.batteryVolt,
        batteryOhm: row.batteryOhm,
        uvVolt: row.uvLedVolt,
        uvMa: row.uvLedMa,
        uvOhm: row.uvLedOhm,
        pcbOhm: row.pcbOhm,
      },
    );
  }

  adc(deviceId: string, kind: AdcKind, window: AtWindow): StoredAdc[] {
    return this.context.sql.all(
      ADC,
      `select at, battery_volt, battery_ohm, uv_volt, uv_ma, uv_ohm, pcb_ohm from bottle_adc
       where device_id = $deviceId and kind = $kind and at >= $from and at <= $to order by at`,
      { deviceId, kind, from: window.from, to: window.to },
    );
  }

  newestAdcAt(deviceId: string, kind: AdcKind, notAfter: number): number | null {
    return (
      this.context.sql.get(
        EXTREME,
        `select max(at) as at from bottle_adc
         where device_id = $deviceId and kind = $kind and at <= $notAfter`,
        { deviceId, kind, notAfter },
      )?.at ?? null
    );
  }

  saveSnapshot(deviceId: string, kind: string, at: string, value: JsonValue): void {
    this.context.sql.run(
      'save the bottle snapshot',
      `insert into bottle_snapshots (device_id, kind, at, value) values ($deviceId, $kind, $at, $value)
       on conflict (device_id, kind) do update set at = excluded.at, value = excluded.value`,
      { deviceId, kind, at, value: jsonText(value) },
    );
  }

  snapshot(deviceId: string, kind: string): StoredSnapshot | undefined {
    return this.context.sql.get(
      SNAPSHOT,
      'select at, value from bottle_snapshots where device_id = $deviceId and kind = $kind',
      { deviceId, kind },
    );
  }

  addSync(deviceId: string, row: StoredSync): void {
    this.context.sql.run(
      'save the sync record',
      `insert or ignore into bottle_syncs (device_id, started_at, ended_at, cause, outcome, detail,
         requests, answered, rssi, client_id)
       values ($deviceId, $startedAt, $endedAt, $cause, $outcome, $detail, $requests, $answered,
         $rssi, $clientId)`,
      {
        deviceId,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        cause: row.cause,
        outcome: row.outcome,
        detail: row.detail,
        requests: row.requests,
        answered: row.answered,
        rssi: row.rssi,
        clientId: row.clientId,
      },
    );
  }

  syncs(deviceId: string, limit: number): StoredSync[] {
    return this.context.sql.all(
      SYNC,
      `select started_at, ended_at, cause, outcome, detail, requests, answered, rssi, client_id
       from bottle_syncs where device_id = $deviceId order by started_at desc limit $limit`,
      { deviceId, limit },
    );
  }

  syncsSince(deviceId: string, since: string): StoredSync[] {
    return this.context.sql.all(
      SYNC,
      `select started_at, ended_at, cause, outcome, detail, requests, answered, rssi, client_id
       from bottle_syncs where device_id = $deviceId and started_at >= $since order by started_at`,
      { deviceId, since },
    );
  }

  private newest(table: string, deviceId: string, notAfter: number): number | null {
    return (
      this.context.sql.get(
        EXTREME,
        `select max(at) as at from ${table} where device_id = $deviceId and at <= $notAfter`,
        { deviceId, notAfter },
      )?.at ?? null
    );
  }
}
