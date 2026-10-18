import type { LogLevel } from './levels';
import { FOREGROUND, RESET, type Colour } from './palette';
import type { LogPayload } from './redaction';
import type { LogRecord } from './record';

const LEVEL_COLOUR: Readonly<Record<LogLevel, Colour>> = {
  trace: 'grey',
  debug: 'grey',
  info: 'green',
  warn: 'yellow',
  error: 'red',
  exception: 'magenta',
  none: 'white',
};

interface Ink {
  readonly bracket: (text: string, colour: Colour) => string;
  readonly event: (text: string, colour: Colour) => string;
  readonly pair: (name: string, value: string) => string;
  readonly quiet: (text: string) => string;
  readonly alarm: (text: string) => string;
  readonly close: string;
}

const PLAIN: Ink = {
  bracket: (text) => `[${text}]`,
  event: (text) => text,
  pair: (name, value) => `${name}=${value}`,
  quiet: (text) => text,
  alarm: (text) => text,
  close: '',
};

const COLOURED: Ink = {
  bracket: (text, colour) => `${FOREGROUND.white}[${FOREGROUND[colour]}${text}${FOREGROUND.white}]`,
  event: (text, colour) => `${FOREGROUND[colour]}${text}`,
  pair: (name, value) => `${FOREGROUND.grey}${name}=${FOREGROUND.cyan}${value}`,
  quiet: (text) => `${FOREGROUND.grey}${text}`,
  alarm: (text) => `${FOREGROUND.red}${text}`,
  close: RESET,
};

function colourOfLevel(level: LogLevel): Colour {
  return LEVEL_COLOUR[level];
}

function timeOf(timestamp: string): string {
  return timestamp.slice(11, 19);
}

function valueOf(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function detailOf(payload: LogPayload, ink: Ink): string {
  return Object.entries(payload)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${ink.pair(name, valueOf(value))}`)
    .join('');
}

function render(record: LogRecord, ink: Ink): string {
  const colour = colourOfLevel(record.level);

  const heading =
    ink.bracket(timeOf(record.timestamp), 'blue') +
    '-' +
    ink.bracket(record.level.toUpperCase(), colour) +
    '-' +
    ink.bracket(record.scope, colour) +
    ': ';

  const duration =
    record.durationMs === undefined ? '' : ink.quiet(` (${String(record.durationMs)}ms)`);

  const failure =
    record.failure === undefined
      ? ''
      : ink.alarm(
          `\n${record.failure.name}: ${record.failure.message}` +
            (record.failure.stack === undefined ? '' : `\n${record.failure.stack}`),
        );

  return `${heading}${ink.event(record.event, colour)}${duration}${detailOf(
    record.payload,
    ink,
  )}${failure}${ink.close}`;
}

export function renderPretty(record: LogRecord): string {
  return render(record, COLOURED);
}

export function renderPlain(record: LogRecord): string {
  return render(record, PLAIN);
}

export function renderJson(record: LogRecord): string {
  return JSON.stringify(record);
}
