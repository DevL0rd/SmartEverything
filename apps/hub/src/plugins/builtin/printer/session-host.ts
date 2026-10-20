import { z } from 'zod';
import type { PluginEvent } from '@smarteverything/domain';
import { readDescription, type PlainObject, type PrinterDescription } from '@smarteverything/ipp';
import type { Logger } from '@smarteverything/logging';
import type { PluginMetrics, PluginRecords, PluginSecrets, PluginViewers } from '../contract';
import type { PrinterAddress } from './address';
import type { PrinterClient } from './client';
import type { HomeClock } from './clock';
import type { Credentials } from './http-auth';
import { PrinterLedger } from './ledger';
import type { PrinterModel } from './model';
import {
  daysCollection,
  eventsCollection,
  jobsCollection,
  marksCollection,
  spansCollection,
  supplyDaysCollection,
} from './records';

export interface ClientSetup {
  readonly address: PrinterAddress;
  readonly pin: string | null;
  readonly credentials: Credentials | null;
}

export interface SessionHost {
  readonly log: Logger;
  readonly clock: HomeClock;
  readonly records: (collection: string) => PluginRecords;
  readonly secrets: PluginSecrets;
  readonly viewers: PluginViewers;
  readonly metrics: PluginMetrics;
  readonly send: (event: PluginEvent) => void;
  readonly signal: AbortSignal;
  readonly openClient: (setup: ClientSetup) => PrinterClient;
  readonly changed: () => void;
}

export interface Described {
  readonly raw: PlainObject;
  readonly description: PrinterDescription;
}

export const SNAPSHOTS = 'snapshots';
export const PASSWORD_SECRET = 'password';

const SNAPSHOT = z.strictObject({ raw: z.record(z.string(), z.json()) });

export function passwordSecretName(uuid: string): string {
  return `${PASSWORD_SECRET}.${uuid}`;
}

export function readSnapshot(raw: unknown): Described | null {
  const parsed = SNAPSHOT.safeParse(raw);
  if (!parsed.success) return null;
  const plain: PlainObject = parsed.data.raw;
  return { raw: plain, description: readDescription(plain) };
}

export function openLedger(host: SessionHost, uuid: string): PrinterLedger {
  return new PrinterLedger(
    {
      days: host.records(daysCollection(uuid)),
      jobs: host.records(jobsCollection(uuid)),
      supplyDays: host.records(supplyDaysCollection(uuid)),
      marks: host.records(marksCollection(uuid)),
      events: host.records(eventsCollection(uuid)),
      spans: host.records(spansCollection(uuid)),
    },
    host.clock,
    host.log,
  );
}

export function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'unknown';
}

export function spanState(
  model: PrinterModel,
): 'idle' | 'printing' | 'stopped' | 'asleep' | 'offline' {
  if (!model.online) return 'offline';
  return model.power === 'awake' ? model.state : 'asleep';
}
