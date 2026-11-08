import { LONGEST_TIMER_MS } from '../../../automations/plugin-kinds/until';
import {
  actionNode,
  automation,
  input,
  optionalInput,
  output,
  ports,
  queryNode,
} from '../automation-kit';
import {
  IDENTIFY_TOOL,
  JOB_TOOL,
  PAUSE_TOOL,
  PRINT_TOOL,
  STAT_TOOL,
  TEST_PAGE_TOOL,
} from './automation-tools';
import { JOB, PRINTER } from './automation-entities';
import { PRINTER_TRIGGERS } from './automation-triggers';
import { JOB_FINISHED } from './events';

const COMMAND_TIMEOUT = { default: 30_000, max: 120_000 } as const;
const PRINT_TIMEOUT = { default: 60_000, max: 300_000 } as const;
const PRINT_WAIT_DEFAULT_MS = 30 * 60_000;
const COPIES_MIN = 1;

const REASON_CLASSES = {
  unreachable: 'Unreachable',
  not_authorized: 'Forbidden',
  not_authenticated: 'Forbidden',
  not_a_printer: 'NotFound',
  format_unsupported: 'Invalid',
  rate_limited: 'LimitExceeded',
} as const;

const SIDES = [
  { id: 'one-sided', label: 'One side' },
  { id: 'two-sided-long-edge', label: 'Both sides, flip on the long edge' },
  { id: 'two-sided-short-edge', label: 'Both sides, flip on the short edge' },
] as const;

const COLOURS = [
  { id: 'color', label: 'Colour' },
  { id: 'monochrome', label: 'Black and white' },
] as const;

const JOB_ACTION_CHOICES = [
  { id: 'cancel', label: 'Cancel it' },
  { id: 'hold', label: 'Hold it' },
  { id: 'release', label: 'Release it' },
] as const;

const PERIODS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
] as const;

const METRICS = [
  { id: 'pages', label: 'Pages' },
  { id: 'colour_pages', label: 'Colour pages' },
  { id: 'cost', label: 'Cost' },
  { id: 'ink_used', label: 'Ink used' },
] as const;

const IDENTIFY_CHOICES = [
  { id: 'flash', label: 'Flash its light' },
  { id: 'sound', label: 'Beep' },
  { id: 'display', label: 'Show a message on its display' },
  { id: 'speak', label: 'Say it aloud' },
] as const;

const PRINT = actionNode({
  id: 'print',
  version: 1,
  title: 'Print a picture',
  description:
    'Prints a picture on a printer. Give it the id of a camera picture or a made picture. Sending hands the job to the printer and goes on. Waiting continues when the printer has finished the job, and gives its job.',
  icon: 'printer',
  keywords: ['printer', 'print', 'paper', 'picture', 'photo', 'copies'],
  summary: 'Print {picture} on {printer}',
  tool: PRINT_TOOL,
  inputs: {
    printer: input(PRINTER.kind, { title: 'Printer', description: 'The printer to print on.' }),
    picture: input(ports.text(), {
      title: 'Picture',
      description: 'The picture id from Camera picture or Make a picture.',
    }),
    copies: optionalInput(ports.number({ integer: true, min: COPIES_MIN }), {
      title: 'Copies',
      description: 'How many copies. One when left out.',
      default: 1,
      ui: { min: COPIES_MIN, step: 1 },
    }),
    sides: optionalInput(ports.choice(SIDES), {
      title: 'Sides',
      description: 'One side or both. Your own setting for this printer when left out.',
    }),
    colour: optionalInput(ports.choice(COLOURS), {
      title: 'Colour',
      description: 'Colour or black and white. Your own setting for this printer when left out.',
    }),
    wait: optionalInput(ports.duration(), {
      title: 'Wait for the job',
      description:
        'How long to wait for the printer to finish before the step takes its If it fails exit with the reason Timeout. Only used when the step waits.',
      default: PRINT_WAIT_DEFAULT_MS,
      ui: { min: 1, max: LONGEST_TIMER_MS },
    }),
  },
  outputs: {
    job: output(JOB.kind, {
      title: 'Print job',
      description: 'The job the printer accepted. Only set when the step waited.',
      from: '/job/key',
    }),
  },
  args: {
    action: { lit: 'print' },
    printer: { port: 'printer' },
    source: { record: { kind: { lit: 'picture' }, pictureId: { port: 'picture' } } },
    options: {
      record: {
        copies: { port: 'copies' },
        sides: { port: 'sides' },
        colorMode: { port: 'colour' },
      },
    },
  },
  until: { event: JOB_FINISHED, match: { job: { output: 'job' } }, timeout: { port: 'wait' } },
  timeout: PRINT_TIMEOUT,
  errors: REASON_CLASSES,
  waitOnly: ['job'],
});

const TEST_PAGE = actionNode({
  id: 'test_page',
  version: 1,
  title: 'Print a test page',
  description: 'Prints the test page of a printer: colour swatches, a grey ramp and a grid.',
  icon: 'fileText',
  keywords: ['printer', 'test', 'page', 'check', 'alignment'],
  summary: 'Print a test page on {printer}',
  tool: TEST_PAGE_TOOL,
  inputs: {
    printer: input(PRINTER.kind, { title: 'Printer', description: 'The printer to test.' }),
  },
  args: { action: { lit: 'test_page' }, printer: { port: 'printer' } },
  timeout: PRINT_TIMEOUT,
  errors: REASON_CLASSES,
});

const JOB_NODE = actionNode({
  id: 'job',
  version: 1,
  title: 'Cancel, hold or release a print job',
  description:
    'Cancels a print job, holds it back in the queue or releases a held one. Wire the job from Print a picture or a print trigger. Your own jobs only, unless you are the owner.',
  icon: 'list',
  keywords: ['printer', 'job', 'cancel', 'hold', 'release', 'queue'],
  summary: '{action} {job}',
  tool: JOB_TOOL,
  inputs: {
    job: input(JOB.kind, { title: 'Print job', description: 'The job to change.' }),
    action: input(ports.choice(JOB_ACTION_CHOICES), {
      title: 'What to do',
      description: 'Cancel it, hold it back or release it.',
    }),
  },
  args: { action: { port: 'action' }, job: { port: 'job' } },
  timeout: COMMAND_TIMEOUT,
  errors: REASON_CLASSES,
});

const STATS = queryNode({
  id: 'stats',
  version: 1,
  title: 'Printing stats',
  description:
    'One printing figure for a day, week, month or year, with the figure for the period before and the change.',
  icon: 'trendUp',
  keywords: ['printer', 'stats', 'pages', 'cost', 'ink', 'usage'],
  summary: '{metric} of {printer} this {period}',
  tool: STAT_TOOL,
  inputs: {
    printer: input(PRINTER.kind, { title: 'Printer', description: 'The printer to read.' }),
    period: input(ports.choice(PERIODS), {
      title: 'Period',
      description: 'The day, week, month or year that contains today.',
    }),
    metric: input(ports.choice(METRICS), {
      title: 'Figure',
      description: 'Pages, colour pages, cost or ink used (percent of a cartridge, all colours).',
    }),
  },
  outputs: {
    value: output(ports.number({ min: 0 }), {
      title: 'This period',
      description: 'The figure for the period so far.',
      from: '/value',
    }),
    previous: output(ports.number({ min: 0 }), {
      title: 'Period before',
      description: 'The figure for the whole period before.',
      from: '/previous',
    }),
    change: output(ports.number(), {
      title: 'Change',
      description: 'This period minus the period before.',
      from: '/change',
    }),
    unit: output(ports.text(), {
      title: 'Unit',
      description: 'Pages, labels, the currency, or a percent for ink used.',
      from: '/unit',
    }),
  },
  args: { printer: { port: 'printer' }, period: { port: 'period' }, metric: { port: 'metric' } },
  timeout: COMMAND_TIMEOUT,
  retry: 'idempotent',
  budget: 'none',
  errors: REASON_CLASSES,
});

const IDENTIFY = actionNode({
  id: 'identify',
  version: 1,
  title: 'Find the printer',
  description: 'Makes a printer flash, beep or show a message so you can tell which one it is.',
  icon: 'locate',
  keywords: ['printer', 'identify', 'find', 'beep', 'flash', 'locate'],
  summary: 'Find {printer}',
  tool: IDENTIFY_TOOL,
  inputs: {
    printer: input(PRINTER.kind, { title: 'Printer', description: 'The printer to find.' }),
    how: optionalInput(ports.choice(IDENTIFY_CHOICES), {
      title: 'How',
      description: 'The way the printer shows itself. The first way it offers when left out.',
    }),
  },
  args: { action: { lit: 'identify' }, printer: { port: 'printer' }, how: { port: 'how' } },
  timeout: COMMAND_TIMEOUT,
  retry: 'idempotent',
  errors: REASON_CLASSES,
});

const PAUSE = actionNode({
  id: 'pause',
  version: 1,
  title: 'Pause or resume a printer',
  description: 'Pauses the print queue of a printer so nothing prints, or lets it run again.',
  icon: 'pause',
  keywords: ['printer', 'pause', 'resume', 'queue', 'stop'],
  summary: 'Printer {printer} paused: {paused}',
  tool: PAUSE_TOOL,
  inputs: {
    printer: input(PRINTER.kind, {
      title: 'Printer',
      description: 'The printer to pause or resume.',
    }),
    paused: input(ports.boolean(), {
      title: 'Paused',
      description: 'On pauses the queue, off lets it run.',
    }),
  },
  args: { printer: { port: 'printer' }, paused: { port: 'paused' } },
  timeout: COMMAND_TIMEOUT,
  retry: 'idempotent',
  access: 'owner',
  errors: REASON_CLASSES,
});

export const PRINTER_AUTOMATION = automation({
  nodes: [PRINT, TEST_PAGE, JOB_NODE, STATS, IDENTIFY, PAUSE],
  triggers: PRINTER_TRIGGERS,
  entities: [PRINTER, JOB],
});
