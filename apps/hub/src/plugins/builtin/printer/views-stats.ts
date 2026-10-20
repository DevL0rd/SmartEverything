import {
  PRINTER_STATS_VIEW,
  printerPeriods,
  type PrinterReadInput,
  type PrinterStatsView,
} from '@smarteverything/domain';
import type { ToolCaller } from '../contract';
import { isOwner, ownsJob } from './access';
import { dayKeyOf } from './clock';
import { perPageCost } from './cost';
import type { JobRecord } from './records';
import type { PrinterSession } from './session';
import { refOf, requiredModel } from './views';

const MONTHS_SHOWN = 12;
const WEEK_MS = 7 * 86_400_000;

export function statsView(
  session: PrinterSession,
  caller: ToolCaller,
  input: Pick<PrinterReadInput, 'period' | 'anchor'>,
  now: Date,
): PrinterStatsView {
  const model = requiredModel(session);
  const ledger = session.ledger;
  const today = dayKeyOf(now, ledger.zone);
  const period = input.period ?? 'week';
  const jobs = ledger.jobs();
  const finished = jobs.filter((record) => record.state === 'completed');
  const stats = printerPeriods({
    days: ledger.days(),
    jobPages: finished.map((record) => record.pages ?? 0),
    period,
    anchor: input.anchor ?? today,
    today,
    firstDay: session.record.firstDay,
    lifetimePages: model.status.counters.pages,
  });
  const cost = perPageCost(model.supplies, session.record.settings);
  return PRINTER_STATS_VIEW.parse({
    printer: refOf(session),
    stats,
    unit: unitOf(session),
    colour: session.description.capabilities.color ?? false,
    budget: {
      weekly: session.record.settings.weeklyBudget,
      monthlyCap: session.record.settings.monthlyCap,
      target: session.record.settings.printLessTarget,
    },
    cost: cost.mono === null && cost.colour === null ? null : costView(session, cost),
    people: peopleOf(finished, caller),
    bests: bestsOf(finished, caller),
    states: statesOf(session, now),
    events: ledger
      .events()
      .slice(-30)
      .map((event) => ({ at: event.at, kind: event.kind, text: event.text })),
  });
}

function unitOf(session: PrinterSession): string {
  const kinds = session.description.identity.kinds;
  if (kinds.includes('receipt')) return 'receipts';
  return kinds.includes('label') || kinds.includes('roll') ? 'labels' : 'pages';
}

function costView(
  session: PrinterSession,
  cost: ReturnType<typeof perPageCost>,
): NonNullable<PrinterStatsView['cost']> {
  const days = session.ledger.days();
  const months = [...new Set(days.map((day) => day.day.slice(0, 7)))].slice(-MONTHS_SHOWN);
  const amount = (month: string): number =>
    days
      .filter((day) => day.day.startsWith(month))
      .reduce((sum, day) => sum + day.mono * (cost.mono ?? 0) + day.color * (cost.colour ?? 0), 0);
  const current = months.at(-1);
  return {
    perMonoPage: cost.mono,
    perColourPage: cost.colour,
    month: current === undefined ? null : Math.round(amount(current) * 100) / 100,
    currency: session.record.settings.currency,
    months: months.map((month) => ({ month, amount: Math.round(amount(month) * 100) / 100 })),
  };
}

function peopleOf(finished: readonly JobRecord[], caller: ToolCaller): PrinterStatsView['people'] {
  if (!isOwner(caller)) {
    const mine = finished.filter((record) => ownsJob(record, caller)).length;
    return [
      { label: 'You', jobs: mine, mine: true },
      { label: 'Others', jobs: finished.length - mine, mine: false },
    ];
  }
  const counts = new Map<string, number>();
  for (const record of finished) {
    const label = record.person ?? 'Others';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, jobs]) => ({ label, jobs, mine: label === caller.profileId }));
}

function bestsOf(finished: readonly JobRecord[], caller: ToolCaller): PrinterStatsView['bests'] {
  if (!isOwner(caller)) return { biggestJob: null, longestSeconds: null };
  const biggest = Math.max(0, ...finished.map((record) => record.pages ?? 0));
  const longest = Math.max(
    0,
    ...finished.map((record) =>
      record.startedAt !== null && record.completedAt !== null
        ? (Date.parse(record.completedAt) - Date.parse(record.startedAt)) / 1000
        : 0,
    ),
  );
  return {
    biggestJob: biggest === 0 ? null : biggest,
    longestSeconds: longest === 0 ? null : Math.round(longest),
  };
}

function statesOf(session: PrinterSession, now: Date): PrinterStatsView['states'] {
  const from = new Date(now.getTime() - WEEK_MS).toISOString();
  const spans = session.ledger.spans().filter((span) => (span.to ?? now.toISOString()) >= from);
  const totals = new Map<string, number>();
  const lane = spans.map((span) => {
    const start = span.from < from ? from : span.from;
    const end = span.to ?? now.toISOString();
    totals.set(
      span.state,
      (totals.get(span.state) ?? 0) + (Date.parse(end) - Date.parse(start)) / 1000,
    );
    return { state: span.state, from: start, to: end };
  });
  return {
    shares: [...totals].map(([state, seconds]) => ({ state, seconds: Math.round(seconds) })),
    lane,
  };
}
