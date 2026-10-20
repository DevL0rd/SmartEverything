import {
  AUTOMATION_TEST_EXPECTATION,
  localClock,
  minuteOfClock,
  shiftedDate,
  zonedInstant,
  type AutomationTestExpectation,
  type AutomationTestResult,
  type AutomationTestsRunReply,
  type JsonValue,
  type StoredTest,
} from '@smarteverything/domain';
import { twoDigits } from '../../../../format/number';
import type { RunStartBody, TestBody } from '../../data/api';
import { overridesOf, valueText, type JsonRecord, type PretendRow } from '../test/test-model';

export type EventWhen =
  | { readonly kind: 'at'; readonly clock: string }
  | { readonly kind: 'after'; readonly minutes: number };

export interface EventRow {
  readonly id: string;
  readonly when: EventWhen;
  readonly device: string;
  readonly control: string;
  readonly value: JsonValue;
}

export const SCRIPT_OUTCOMES = ['ok', 'fail', 'slow', 'unknown', 'offline'] as const;

export type ScriptOutcome = (typeof SCRIPT_OUTCOMES)[number];

export interface ScriptRow {
  readonly id: string;
  readonly target: string;
  readonly outcome: ScriptOutcome;
  readonly message: string;
  readonly delaySeconds: number;
}

export interface StartDraft {
  readonly date: string;
  readonly clock: string;
  readonly zone: string;
}

export interface ScenarioDraft {
  readonly start: StartDraft;
  readonly world: readonly PretendRow[];
  readonly events: readonly EventRow[];
  readonly scripts: readonly ScriptRow[];
}

export type ExpectationRow =
  | { readonly id: string; readonly kind: 'status'; readonly equals: 'succeeded' | 'failed' }
  | {
      readonly id: string;
      readonly kind: 'command';
      readonly effect: string;
      readonly target: string;
    }
  | {
      readonly id: string;
      readonly kind: 'visited';
      readonly node: string;
      readonly visited: boolean;
    };

export const OUTCOME_LABEL: Readonly<Record<ScriptOutcome, string>> = {
  ok: 'Works',
  fail: 'Fails',
  slow: 'Slow',
  unknown: 'Unconfirmed',
  offline: 'Offline',
};

export const SIMULATION_BANNER = {
  title: 'A simulation never touches your home.',
  body: 'It runs on a pretend clock, so waits finish at once.',
} as const;

const MINUTE_MS = 60_000;
const DEFAULT_SLOW_SECONDS = 30;
const DEFAULT_FAILURE = 'The command failed in the simulation.';
const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_TEXT = /^([01]\d|2[0-3]):[0-5]\d$/;

interface Calendar {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function calendarOf(date: string): Calendar | null {
  const match = DATE_TEXT.exec(date);
  if (match === null) return null;
  const [year = 0, month = 0, day = 0] = match.slice(1).map(Number);
  const shifted = shiftedDate({ year, month, day }, 0);
  return shifted.year === year && shifted.month === month && shifted.day === day
    ? { year, month, day }
    : null;
}

export function defaultStart(nowMs: number, zone: string): StartDraft {
  const local = localClock(new Date(nowMs), zone);
  return {
    date: `${String(local.year)}-${twoDigits(local.month)}-${twoDigits(local.day)}`,
    clock: `${twoDigits(Math.floor(local.minuteOfDay / 60))}:${twoDigits(local.minuteOfDay % 60)}`,
    zone,
  };
}

export function startMsOf(start: StartDraft): number | null {
  const calendar = calendarOf(start.date);
  if (calendar === null || !CLOCK_TEXT.test(start.clock)) return null;
  return zonedInstant(calendar, minuteOfClock(start.clock), start.zone).getTime();
}

function nextAt(previous: number, clock: string, zone: string): number {
  const today = localClock(new Date(previous), zone);
  const minute = minuteOfClock(clock);
  const first = zonedInstant(today, minute, zone).getTime();
  return first >= previous ? first : zonedInstant(shiftedDate(today, 1), minute, zone).getTime();
}

export function eventTimes(draft: ScenarioDraft): readonly number[] {
  const start = startMsOf(draft.start);
  if (start === null) return [];
  const times: number[] = [];
  let previous = start;
  for (const row of draft.events) {
    previous =
      row.when.kind === 'after'
        ? previous + row.when.minutes * MINUTE_MS
        : nextAt(previous, row.when.clock, draft.start.zone);
    times.push(previous);
  }
  return times;
}

export function spanMsOf(draft: ScenarioDraft): number {
  const start = startMsOf(draft.start);
  const last = eventTimes(draft).at(-1);
  return start === null || last === undefined ? 0 : last - start;
}

function eventReady(row: EventRow): boolean {
  if (row.device.trim() === '' || row.control.trim() === '') return false;
  return row.when.kind === 'at'
    ? CLOCK_TEXT.test(row.when.clock)
    : Number.isInteger(row.when.minutes) && row.when.minutes >= 0;
}

export function scenarioProblem(draft: ScenarioDraft): string | null {
  if (calendarOf(draft.start.date) === null) return 'Pick a start date.';
  if (!CLOCK_TEXT.test(draft.start.clock)) return 'Pick a start time.';
  if (!draft.events.every(eventReady)) return 'Finish or remove the unfinished timeline rows.';
  return null;
}

function effectsOf(scripts: readonly ScriptRow[]): JsonValue[] {
  return scripts.map((script) => {
    const target = script.target.trim() === '' ? {} : { device: script.target.trim() };
    if (script.outcome === 'fail') {
      const message = script.message.trim() === '' ? DEFAULT_FAILURE : script.message.trim();
      return { ...target, outcome: { kind: 'fail', message } };
    }
    if (script.outcome === 'slow') {
      const seconds = script.delaySeconds > 0 ? script.delaySeconds : DEFAULT_SLOW_SECONDS;
      return { ...target, outcome: { kind: 'slow', delayMs: Math.round(seconds * 1000) } };
    }
    return { ...target, outcome: { kind: script.outcome } };
  });
}

export function scenarioOf(draft: ScenarioDraft): JsonRecord {
  const times = eventTimes(draft);
  const timeline: JsonValue[] = draft.events.map((row, index) => ({
    at: new Date(times[index] ?? 0).toISOString(),
    device: { device: row.device.trim(), control: row.control.trim(), value: row.value },
  }));
  return {
    start: { date: draft.start.date, clock: draft.start.clock, zone: draft.start.zone },
    ...overridesOf(draft.world),
    effects: effectsOf(draft.scripts),
    timeline,
  };
}

export function simulateRequest(
  automationId: string,
  draft: ScenarioDraft,
  breakpoints: readonly string[],
): RunStartBody {
  return {
    automationId,
    mode: 'simulate',
    scenario: scenarioOf(draft),
    breakpoints: [...breakpoints],
  };
}

export function eventText(row: EventRow): string {
  const when =
    row.when.kind === 'at'
      ? `at ${row.when.clock}`
      : `after ${durationText(row.when.minutes * MINUTE_MS)}`;
  return `${when}  ${row.device} ${row.control} to ${valueText(row.value)}`;
}

export function timelineLabel(row: EventRow, time: number | undefined, zone: string): string {
  if (time === undefined) return eventText(row);
  return `${eventText(row)}, ${dayAndClock(time, zone)}`;
}

export function scriptText(row: ScriptRow): string {
  const target = row.target.trim() === '' ? 'Every command' : row.target.trim();
  return `${target}: ${OUTCOME_LABEL[row.outcome].toLowerCase()}`;
}

export function durationText(ms: number): string {
  const minutes = Math.floor(ms / MINUTE_MS);
  if (minutes < 1) return 'under 1 min';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return [
    days > 0 ? `${String(days)} d` : '',
    hours > 0 ? `${String(hours)} h` : '',
    rest > 0 ? `${String(rest)} min` : '',
  ]
    .filter((part) => part !== '')
    .join(' ');
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function dayAndClock(ms: number, zone: string): string {
  const local = localClock(new Date(ms), zone);
  const weekday = WEEKDAYS[local.weekday] ?? '';
  return `${weekday} ${twoDigits(Math.floor(local.minuteOfDay / 60))}:${twoDigits(local.minuteOfDay % 60)}`;
}

export interface VirtualTime {
  readonly startMs: number;
  readonly nowMs: number;
  readonly spanMs: number;
  readonly zone: string;
}

export function virtualTimeText(time: VirtualTime): string {
  const now = dayAndClock(time.nowMs, time.zone);
  if (time.spanMs <= 0) return `Simulated · ${now}`;
  const elapsed = durationText(Math.max(0, time.nowMs - time.startMs));
  return `Simulated · ${now}, ${elapsed} of ${durationText(time.spanMs)}`;
}

export function expectationInput(row: ExpectationRow): AutomationTestExpectation {
  if (row.kind === 'status') return { kind: 'status', equals: row.equals };
  if (row.kind === 'visited')
    return { kind: 'visited', node: row.node.trim(), visited: row.visited };
  const target = row.target.trim();
  return {
    kind: 'command',
    effect: row.effect.trim(),
    times: 1,
    ...(target === '' ? {} : { target }),
  };
}

export function expectationReady(row: ExpectationRow): boolean {
  if (row.kind === 'status') return true;
  return row.kind === 'visited' ? row.node.trim() !== '' : row.effect.trim() !== '';
}

export function expectationText(expectation: AutomationTestExpectation): string {
  switch (expectation.kind) {
    case 'status':
      return `The run ${expectation.equals}`;
    case 'command':
      return `Sends ${expectation.effect}${expectation.target === undefined ? '' : ` to ${expectation.target}`}${expectation.times > 1 ? `, ${String(expectation.times)} times` : ''}`;
    case 'output':
      return `${expectation.name} is ${valueText(expectation.equals)}`;
    case 'visited':
      return `${expectation.node} ${expectation.visited ? 'runs' : 'does not run'}`;
  }
}

export function saveProblem(
  name: string,
  draft: ScenarioDraft,
  expectations: readonly ExpectationRow[],
): string | null {
  if (name.trim() === '') return 'Give the test a name.';
  if (!expectations.every(expectationReady)) return 'Finish or remove the unfinished checks.';
  return scenarioProblem(draft);
}

export function testBody(
  name: string,
  draft: ScenarioDraft,
  expectations: readonly ExpectationRow[],
): TestBody {
  return {
    name: name.trim(),
    scenario: scenarioOf(draft),
    expectations: expectations.map(expectationInput),
  };
}

export type TestStatus = 'pending' | 'passed' | 'failed';

export interface TestRowModel {
  readonly id: string;
  readonly name: string;
  readonly status: TestStatus;
  readonly checks: readonly string[];
  readonly failures: readonly string[];
}

function checksOf(test: StoredTest): readonly string[] {
  return test.expectations.map((item) => {
    const parsed = AUTOMATION_TEST_EXPECTATION.safeParse(item);
    return parsed.success
      ? expectationText(parsed.data)
      : 'A check that this app version cannot read';
  });
}

function statusOf(result: AutomationTestResult | undefined): TestStatus {
  if (result === undefined) return 'pending';
  return result.passed ? 'passed' : 'failed';
}

export function testRows(
  tests: readonly StoredTest[],
  reply: AutomationTestsRunReply | null,
): readonly TestRowModel[] {
  const results = new Map((reply?.results ?? []).map((result) => [result.testId, result]));
  return tests.map((test) => {
    const result = results.get(test.id);
    return {
      id: test.id,
      name: test.name,
      status: statusOf(result),
      checks: checksOf(test),
      failures: (result?.failures ?? []).map((failure) => failure.message),
    };
  });
}

export function resultsSummary(count: number, reply: AutomationTestsRunReply | null): string {
  if (count === 0) return 'No tests yet';
  if (reply === null) return count === 1 ? '1 test' : `${String(count)} tests`;
  if (reply.failed === 0) return `All ${String(reply.passed)} passed`;
  return `${String(reply.passed)} passed, ${String(reply.failed)} failed`;
}
