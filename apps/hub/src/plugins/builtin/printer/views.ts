import type { z } from 'zod';
import {
  PRINTER_JOBS_VIEW,
  PRINTER_OVERVIEW,
  PRINTER_QUEUE_VIEW,
  PRINTER_SUPPLIES_VIEW,
  PRINTER_TRAYS_VIEW,
  attentionOf,
  printerSummary,
  windowOf,
  type PrinterJob,
  type PrinterOverview,
  type PrinterQueue,
  type PrinterReadInput,
  type PrinterSupplyView,
} from '@smarteverything/domain';
import type { ToolCaller } from '../contract';
import { isOwner, jobView, ownsJob } from './access';
import { actionsOf } from './device';
import type { PrinterModel, SupplyRow, TrayRow } from './model';
import type { JobRecord } from './records';
import type { PrinterSession } from './session';
import { dayKeyOf } from './clock';

export function requiredModel(session: PrinterSession): PrinterModel {
  const model = session.model;
  if (model === null) throw new Error(`${session.name} has not been read yet`);
  return model;
}

export function supplyView(row: SupplyRow, session: PrinterSession): PrinterSupplyView {
  const price = session.record.settings.prices[row.key];
  return {
    key: row.key,
    slot: row.slot,
    name: row.name,
    colour: row.colour,
    kind: row.kind,
    consumed: row.consumed,
    level: row.level,
    partial: row.partial,
    standing: row.standing,
    threshold: row.threshold,
    daysLeft: row.forecast === null ? null : Math.round(row.forecast.daysLeft),
    percentPerDay: row.forecast?.percentPerDay ?? null,
    percentPer100Pages: row.forecast?.percentPer100Pages ?? null,
    emptyAt: row.forecast === null ? null : new Date(row.forecast.emptyAt).toISOString(),
    price: price === undefined ? null : { price: price.price, yieldPages: price.yieldPages },
  };
}

function trayView(tray: TrayRow): PrinterOverview['trays'][number] {
  return {
    number: tray.number,
    name: tray.name,
    level: tray.level,
    partial: tray.partial,
    capacity: tray.capacity,
    media: tray.media,
    mediaType: tray.mediaType,
    ok: tray.ok,
  };
}

export function refOf(session: PrinterSession): PrinterOverview['printer'] {
  return { ref: session.externalId, name: session.name, online: session.online };
}

export function overviewView(session: PrinterSession, caller: ToolCaller): PrinterOverview {
  const model = requiredModel(session);
  const today = session.ledger.day(dayKeyOf(new Date(model.observedAt), session.ledger.zone));
  const attention = attentionOf(model.supplies, model.problems);
  const summary = printerSummary({
    state: model.state,
    power: model.power,
    paused: model.paused,
    attention,
  });
  return PRINTER_OVERVIEW.parse({
    printer: refOf(session),
    state: model.state,
    queue: model.paused ? 'paused' : 'running',
    power: model.power,
    summary: summary.text,
    tone: summary.tone,
    queued: model.status.queuedJobs ?? 0,
    supplies: model.supplies.map((row) => supplyView(row, session)),
    trays: model.trays.map(trayView),
    bins: model.bins.map(trayView),
    today: {
      pagesToday: model.pagesToday,
      pagesWeek: model.pagesWeek,
      jobsToday: today.jobs,
      color: today.color,
      mono: today.mono,
      weeklyBudget: session.record.settings.weeklyBudget,
      lifetimePages: model.status.counters.pages,
    },
    daysLeft: model.daysLeft === null ? null : Math.round(model.daysLeft),
    actions: actionsOf(model, caller),
  });
}

export function traysView(session: PrinterSession): z.infer<typeof PRINTER_TRAYS_VIEW> {
  const model = requiredModel(session);
  return PRINTER_TRAYS_VIEW.parse({
    printer: refOf(session),
    trays: model.trays.map(trayView),
    bins: model.bins.map(trayView),
    mediaReady: model.status.mediaReady,
  });
}

function liveJob(record: JobRecord, session: PrinterSession, caller: ToolCaller): PrinterJob {
  const model = session.model;
  const view = jobView(record, caller);
  if (model?.activeJob === null || model === null) return view;
  const active = record.state === 'processing' || record.state === 'stopped';
  return active
    ? { ...view, pagesDone: model.activeJob.pagesDone, progress: model.jobProgress }
    : view;
}

const OPEN: ReadonlySet<JobRecord['state']> = new Set(['pending', 'held', 'processing', 'stopped']);

export function queueView(session: PrinterSession, caller: ToolCaller): PrinterQueue {
  const records = session.ledger.jobs();
  const open = records
    .filter((record) => OPEN.has(record.state))
    .sort((left, right) => ((left.createdAt ?? '') < (right.createdAt ?? '') ? -1 : 1));
  const active =
    open.find((record) => record.state === 'processing' || record.state === 'stopped') ?? null;
  const waiting = open.filter((record) => record !== active);
  const finished = records
    .filter((record) => !OPEN.has(record.state))
    .sort((left, right) => ((left.completedAt ?? '') < (right.completedAt ?? '') ? 1 : -1))[0];
  return PRINTER_QUEUE_VIEW.parse({
    printer: refOf(session),
    active: active === null ? null : liveJob(active, session, caller),
    waiting: waiting.map((record, index) => jobView(record, caller, index)),
    others: open.filter((record) => !ownsJob(record, caller)).length,
    last: finished === undefined ? null : jobView(finished, caller),
  });
}

export interface JobFilter {
  readonly state: PrinterReadInput['state'];
  readonly from: string | undefined;
  readonly to: string | undefined;
  readonly person: string | undefined;
  readonly limit: number;
}

function stateMatches(record: JobRecord, state: PrinterReadInput['state']): boolean {
  if (state === undefined || state === 'all') return true;
  if (state === 'active') return record.state === 'processing' || record.state === 'stopped';
  if (state === 'waiting') return record.state === 'pending' || record.state === 'held';
  return record.state === state;
}

export function jobsView(
  session: PrinterSession,
  caller: ToolCaller,
  filter: JobFilter,
): z.infer<typeof PRINTER_JOBS_VIEW> {
  const records = session.ledger
    .jobs()
    .filter((record) => stateMatches(record, filter.state))
    .filter((record) => filter.from === undefined || (record.createdAt ?? '') >= filter.from)
    .filter((record) => filter.to === undefined || (record.createdAt ?? '') <= filter.to)
    .filter(
      (record) =>
        filter.person === undefined || (isOwner(caller) && record.person === filter.person),
    )
    .sort((left, right) => ((left.createdAt ?? '') < (right.createdAt ?? '') ? 1 : -1));
  return PRINTER_JOBS_VIEW.parse({
    printer: refOf(session),
    jobs: records.slice(0, filter.limit).map((record) => jobView(record, caller)),
    total: records.length,
    gaps: gapsOf(session),
  });
}

function gapsOf(
  session: PrinterSession,
): { from: string; to: string; atLeastPages: number | null }[] {
  return session.ledger.days().flatMap((day) =>
    day.gaps.map((gap) => ({
      from: new Date(Date.parse(`${day.day}T00:00:00Z`) + gap.from * 60_000).toISOString(),
      to: new Date(Date.parse(`${day.day}T00:00:00Z`) + gap.to * 60_000).toISOString(),
      atLeastPages: day.estimatedPages,
    })),
  );
}

export function suppliesView(
  session: PrinterSession,
  period: 'day' | 'week' | 'month' | 'year',
  now: Date,
): z.infer<typeof PRINTER_SUPPLIES_VIEW> {
  const model = requiredModel(session);
  const today = dayKeyOf(now, session.ledger.zone);
  const window = windowOf(period === 'day' ? 'week' : period, today);
  const from =
    period === 'day'
      ? dayKeyOf(new Date(now.getTime() - 86_400_000), session.ledger.zone)
      : window.from;
  const days = [...session.ledger.supplyDays()]
    .filter(([day]) => day >= from && day <= today)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return PRINTER_SUPPLIES_VIEW.parse({
    printer: refOf(session),
    period,
    supplies: model.supplies.map((row) => supplyView(row, session)),
    lines: model.supplies.map((row) => ({
      key: row.key,
      points: days.flatMap(([day, entry]) => {
        const known = entry[row.key];
        return known === undefined ? [] : [{ at: `${day}T12:00:00.000Z`, level: known.close }];
      }),
      forecast: forecastLine(row, now),
    })),
    marks: session.ledger
      .marks()
      .filter((mark) => mark.at.slice(0, 10) >= from)
      .map((mark) => ({ key: mark.key, at: mark.at, kind: mark.kind, certain: mark.certain })),
    gaps: gapsOf(session).map((gap) => ({ from: gap.from, to: gap.to })),
  });
}

function forecastLine(row: SupplyRow, now: Date): { at: string; level: number }[] {
  if (row.forecast === null || row.level === null) return [];
  return [
    { at: now.toISOString(), level: row.level },
    { at: new Date(row.forecast.emptyAt).toISOString(), level: row.consumed ? 0 : 100 },
  ];
}
