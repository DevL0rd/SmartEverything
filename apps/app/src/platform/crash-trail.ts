import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import {
  CLIENT_CRUMBS_MAX,
  CLIENT_FAILURES_MAX,
  CLIENT_FAILURE_LEVELS,
  CLIENT_FAILURE,
  CLIENT_PROCESS_EXIT,
  type ClientCrumb,
  type ClientFailure,
} from '@smarteverything/domain';
import { Logger, redactText, type LogRecord } from '@smarteverything/logging';
import { jsonText } from '../format/json-text';

const log = new Logger('app.crash-trail');

const STORAGE_KEY = 'smarteverything.crash-trail';
const SAVE_AFTER_MS = 1000;
const MESSAGE_MAX = 400;
const STACK_MAX = 1200;
const NAME_MAX = 80;
const OWN_SCOPE = 'app.crash-trail';
const NO_SCREEN = 'start';

const SAVED_TRAIL = z.object({
  failures: z.array(CLIENT_FAILURE),
});

interface Trail {
  failures: ClientFailure[];
  crumbs: ClientCrumb[];
  screen: string;
  saveTimer: ReturnType<typeof setTimeout> | null;
}

const trail: Trail = { failures: [], crumbs: [], screen: NO_SCREEN, saveTimer: null };

function isFailureLevel(level: string): level is ClientFailure['level'] {
  return CLIENT_FAILURE_LEVELS.some((known) => known === level);
}

function hintOf(record: LogRecord): string | null {
  const reason = record.payload['reason'] ?? record.payload['detail'];
  return typeof reason === 'string' ? reason : null;
}

function failureOf(record: LogRecord, level: ClientFailure['level']): ClientFailure {
  const message = record.failure?.message ?? hintOf(record);
  const stack = record.failure?.stack;
  const exit = CLIENT_PROCESS_EXIT.safeParse(record.payload['processExit']);
  return {
    at: record.timestamp,
    level,
    scope: record.scope,
    event: record.event,
    screen: trail.screen,
    name: record.failure === undefined ? null : redactText(record.failure.name, NAME_MAX),
    message: message === null ? null : redactText(message, MESSAGE_MAX),
    stack: stack === undefined ? null : redactText(stack, STACK_MAX),
    ...(exit.success ? { processExit: exit.data } : {}),
  };
}

function save(): void {
  trail.saveTimer = null;
  const text = JSON.stringify({ failures: trail.failures });
  AsyncStorage.setItem(STORAGE_KEY, text).catch((error: unknown) => {
    log.warn('trail.not_saved', { reason: String(error) });
  });
}

function saveSoon(): void {
  trail.saveTimer ??= setTimeout(save, SAVE_AFTER_MS);
}

export function recordLog(record: LogRecord): void {
  if (record.scope === OWN_SCOPE) {
    return;
  }
  if (isFailureLevel(record.level)) {
    trail.failures = [...trail.failures, failureOf(record, record.level)].slice(
      -CLIENT_FAILURES_MAX,
    );
    saveSoon();
    return;
  }
  if (record.level === 'info') {
    const crumb = {
      at: record.timestamp,
      scope: record.scope,
      event: record.event,
      screen: trail.screen,
    };
    trail.crumbs = [...trail.crumbs, crumb].slice(-CLIENT_CRUMBS_MAX);
  }
}

export function setScreen(screen: string): void {
  trail.screen = screen === '' ? NO_SCREEN : screen;
}

export async function restoreTrail(): Promise<void> {
  const text = await AsyncStorage.getItem(STORAGE_KEY);
  if (text === null) {
    return;
  }
  const read = jsonText(text);
  const saved = read.ok ? SAVED_TRAIL.safeParse(read.value) : null;
  if (saved?.success !== true) {
    log.warn('trail.discarded', { reason: 'the saved trail was unreadable' });
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }
  trail.failures = [...saved.data.failures, ...trail.failures].slice(-CLIENT_FAILURES_MAX);
}

export interface TrailContents {
  readonly failures: readonly ClientFailure[];
  readonly recent: readonly ClientCrumb[];
}

export function pendingTrail(): TrailContents | null {
  return trail.failures.length === 0
    ? null
    : { failures: [...trail.failures], recent: [...trail.crumbs] };
}

export async function clearSent(sent: number): Promise<void> {
  trail.failures = trail.failures.slice(sent);
  if (trail.saveTimer !== null) {
    clearTimeout(trail.saveTimer);
    trail.saveTimer = null;
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ failures: trail.failures }));
}
