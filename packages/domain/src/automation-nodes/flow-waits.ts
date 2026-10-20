import { isCatchableErrorClass } from '../automation-v3/errors';
import { ERROR_CLASSES } from '../automation-v3/policy';
import type { FlowType } from '../automation-v3/types';
import { SIGNAL_MATCHER, type SignalMatcher } from '../signal-matcher';
import type { JsonValue } from '../values';
import { defineNodeKind, type InputPortDecl, type NodeKind, type OutputPortDecl } from './define';

const TEXT: FlowType = { t: 'text' };
const ANY: FlowType = { t: 'any' };
const DURATION: FlowType = { t: 'duration' };
const FLAG: FlowType = { t: 'boolean' };
const INSTANT: FlowType = { t: 'instant' };

const LATE_RUN: FlowType = {
  t: 'choice',
  options: [
    { id: 'run', label: 'Run it now' },
    { id: 'skip', label: 'Skip it' },
    { id: 'fail', label: 'Fail' },
  ],
};

const LATE_SKIP: FlowType = {
  t: 'choice',
  options: [
    { id: 'skip', label: 'Skip it' },
    { id: 'run', label: 'Run it now' },
  ],
};

const MILLISECONDS = { unit: 'ms', step: 1000, min: 0 } as const;

export const WAIT_UNTIL_GRACE_MS = 300_000;

function option(
  name: string,
  type: FlowType,
  description: string,
  extra: Partial<InputPortDecl> = {},
): InputPortDecl {
  return { name, type, required: false, static: true, description, ...extra };
}

function input(
  name: string,
  type: FlowType,
  description: string,
  extra: Partial<InputPortDecl> = {},
): InputPortDecl {
  return { name, type, required: true, description, ...extra };
}

function output(
  name: string,
  type: FlowType,
  description: string,
  optional = false,
): OutputPortDecl {
  return optional ? { name, type, optional, description } : { name, type, description };
}

const TIMEOUT = option(
  'timeout',
  DURATION,
  'Give up after this long and take the timed out exit.',
  {
    ui: MILLISECONDS,
  },
);

const wait = defineNodeKind({
  id: 'flow.wait',
  name: 'Wait',
  category: 'flow',
  icon: 'hourglass',
  class: 'control',
  description:
    'Pauses the run for a length of time. The deadline is stored, so it holds across a restart.',
  inputs: [
    {
      name: 'duration',
      type: DURATION,
      required: true,
      summary: true,
      description: 'How long to wait.',
      ui: MILLISECONDS,
    },
    option('ifLate', LATE_RUN, 'What to do when the hub was down past the deadline.', {
      default: 'run',
    }),
  ],
  outputs: [],
  exits: [],
  summary: 'Wait {duration}',
  keywords: ['delay', 'pause', 'sleep', 'minutes', 'seconds'],
  access: 'member',
  tier: 'v1',
});

const waitUntilTime = defineNodeKind({
  id: 'flow.wait_until_time',
  name: 'Wait until',
  category: 'flow',
  icon: 'calendar-clock',
  class: 'control',
  description:
    'Pauses until a moment or the next time of day at home. Set either a moment or a time of day.',
  inputs: [
    {
      name: 'at',
      type: INSTANT,
      required: false,
      summary: true,
      description: 'The moment to wait for.',
    },
    {
      name: 'clock',
      type: { t: 'timeOfDay' },
      required: false,
      static: true,
      summary: true,
      description: 'The next time of day to wait for, in the home time zone.',
    },
    option(
      'ifLate',
      LATE_SKIP,
      'What to do when the time has already passed by more than the grace.',
      {
        default: 'skip',
      },
    ),
    option('grace', DURATION, 'How late the wait may be and still run.', {
      default: WAIT_UNTIL_GRACE_MS,
      ui: MILLISECONDS,
    }),
  ],
  outputs: [],
  exits: [],
  summary: 'Wait until {at} {clock}',
  keywords: ['until', 'at', 'time', 'clock', 'morning', 'schedule'],
  access: 'member',
  tier: 'v1',
});

const waitEvent = defineNodeKind({
  id: 'flow.wait_event',
  name: 'Wait for event',
  category: 'flow',
  icon: 'radar',
  class: 'control',
  description:
    'Pauses until a signal arrives. Only signals after the wait starts count, and signals missed while the hub is down are lost.',
  inputs: [
    option('source', TEXT, 'Signal source, for example device, event or weather.', {
      required: true,
      summary: true,
    }),
    option('kind', TEXT, 'Signal kind within the source.', { required: true, summary: true }),
    option('subject', TEXT, 'Only this subject.'),
    option('field', TEXT, 'Only this field.'),
    option('match', { t: 'record', values: ANY }, 'Details that must match exactly.'),
    TIMEOUT,
  ],
  outputs: [
    output('subject', TEXT, 'The subject of the signal.', true),
    output('field', TEXT, 'The field of the signal.', true),
    output('value', ANY, 'The value of the signal.', true),
    output('previous', ANY, 'The value before.', true),
    output('data', { t: 'record', values: ANY }, 'The match details of the signal.'),
    output('at', INSTANT, 'When the signal arrived.'),
  ],
  exits: ['next', 'timedOut'],
  scopes: { required: [], optional: ['timedOut'] },
  summary: 'Wait for {kind} from {source}',
  keywords: ['signal', 'event', 'wait for', 'door', 'arrives', 'timeout'],
  access: 'member',
  tier: 'v1',
});

const waitCondition = defineNodeKind({
  id: 'flow.wait_condition',
  name: 'Wait until true',
  category: 'flow',
  icon: 'hourglass',
  class: 'control',
  description:
    'Pauses until a condition is true. It continues at once when already true, otherwise it listens to exactly what the condition reads.',
  inputs: [
    {
      name: 'condition',
      type: FLAG,
      required: true,
      live: true,
      summary: true,
      description: 'The condition to wait for.',
    },
    option('hold', DURATION, 'The condition must stay true this long.', { ui: MILLISECONDS }),
    TIMEOUT,
  ],
  outputs: [],
  exits: ['next', 'timedOut'],
  scopes: { required: [], optional: ['timedOut'] },
  summary: 'Wait until {condition}',
  keywords: ['until', 'condition', 'stays', 'nobody', 'hold', 'timeout'],
  access: 'member',
  tier: 'v1',
});

const parallel = defineNodeKind({
  id: 'flow.parallel',
  name: 'Do together',
  category: 'flow',
  icon: 'git-fork',
  class: 'control',
  description: 'Runs two or more branches at the same time. Branches cannot write run variables.',
  inputs: [
    option(
      'join',
      {
        t: 'choice',
        options: [
          { id: 'all', label: 'Wait for all' },
          { id: 'first', label: 'First to finish wins' },
          { id: 'settled', label: 'Wait for all and record each result' },
        ],
      },
      'When the node is done.',
      { default: 'all', summary: true },
    ),
    option(
      'errors',
      {
        t: 'choice',
        options: [
          { id: 'failFast', label: 'Cancel the others on the first error' },
          { id: 'settle', label: 'Let every branch finish' },
        ],
      },
      'What an error in one branch does to the others.',
      { default: 'failFast' },
    ),
  ],
  outputs: [
    {
      name: 'status',
      type: {
        t: 'list',
        of: {
          t: 'record',
          fields: {
            branch: TEXT,
            ok: FLAG,
            error: { t: 'optional', of: { t: 'error' } },
          },
        },
      },
      optional: true,
      description: 'How each branch ended. Present only when the join is settled.',
    },
  ],
  exits: [],
  scopes: { required: [], optional: [], minimum: 2 },
  summary: 'Do together, {join}',
  keywords: ['concurrent', 'at the same time', 'branches', 'fork', 'join', 'race'],
  access: 'member',
  tier: 'v1',
});

const tryNode = defineNodeKind({
  id: 'flow.try',
  name: 'Try',
  category: 'flow',
  icon: 'life-buoy',
  class: 'control',
  description:
    'Runs the try scope. A catch row for the error class handles a failure, and finally always runs once.',
  inputs: [],
  outputs: [],
  exits: [],
  scopes: { required: ['try'], optional: ['finally'] },
  summary: 'Try',
  keywords: ['catch', 'error', 'finally', 'fallback', 'recover', 'exception'],
  access: 'member',
  tier: 'v1',
});

const returnNode = defineNodeKind({
  id: 'flow.return',
  name: 'Return',
  category: 'flow',
  icon: 'corner-down-left',
  class: 'control',
  description:
    'Ends the Custom Node or called automation with its outputs. At the top of a triggered automation it ends the run as succeeded.',
  inputs: [option('exit', TEXT, 'The exit to leave by, for action Custom Nodes.')],
  outputs: [],
  exits: [],
  summary: 'Return',
  keywords: ['end', 'result', 'output', 'exit', 'function'],
  access: 'member',
  tier: 'v1',
});

const stop = defineNodeKind({
  id: 'flow.stop',
  name: 'Stop run',
  category: 'flow',
  icon: 'circle-stop',
  class: 'control',
  description:
    'Ends the whole run as succeeded, as failed, or as cancelled. Stopping another automation is a different node.',
  inputs: [
    {
      name: 'message',
      type: TEXT,
      required: false,
      summary: true,
      description: 'The reason shown in the run history.',
    },
    option('failed', FLAG, 'End the run as failed and run the failure handler.', {
      default: false,
    }),
    option('cancelSelf', FLAG, 'End the run as cancelled.', { default: false }),
  ],
  outputs: [],
  exits: [],
  summary: 'Stop with {message}',
  keywords: ['end', 'halt', 'abort', 'cancel', 'quit'],
  access: 'member',
  tier: 'v1',
});

const RAISABLE_CLASSES = ERROR_CLASSES.filter((name) => isCatchableErrorClass(name));

const fail = defineNodeKind({
  id: 'flow.fail',
  name: 'Raise error',
  category: 'flow',
  icon: 'triangle-alert',
  class: 'control',
  description:
    'Raises a catchable error that the nearest try handles. Wire the caught error into cause to rethrow it; without a message it keeps the message of the cause.',
  inputs: [
    input('message', TEXT, 'What went wrong; leave it out to keep the message of the cause.', {
      summary: true,
      required: false,
    }),
    option(
      'class',
      {
        t: 'choice',
        options: RAISABLE_CLASSES.map((id) => ({ id, label: id })),
      },
      'The error class.',
      { default: 'Failed' },
    ),
    {
      name: 'cause',
      type: { t: 'error' },
      required: false,
      description: 'The error this one wraps.',
    },
  ],
  outputs: [],
  exits: [],
  summary: 'Fail with {message}',
  keywords: ['error', 'throw', 'raise', 'rethrow', 'fail'],
  access: 'member',
  tier: 'v1',
});

export const TRY_SCOPE_OUTPUTS: readonly OutputPortDecl[] = [
  { name: 'error', type: { t: 'error' }, description: 'The error a catch row handles.' },
];

export const WAIT_KINDS: readonly NodeKind[] = [wait, waitUntilTime, waitEvent, waitCondition];

export const END_KINDS: readonly NodeKind[] = [parallel, tryNode, returnNode, stop, fail];

type PortValues = Readonly<Record<string, JsonValue | undefined>>;

export type WaitEventMatcher =
  | { readonly ok: true; readonly matcher: SignalMatcher }
  | { readonly ok: false; readonly error: string };

export function compileWaitEventMatcher(ports: PortValues): WaitEventMatcher {
  const parsed = SIGNAL_MATCHER.safeParse({
    source: ports['source'],
    kind: ports['kind'],
    ...(ports['subject'] === undefined ? {} : { subject: ports['subject'] }),
    ...(ports['field'] === undefined ? {} : { field: ports['field'] }),
    ...(ports['match'] === undefined ? {} : { match: ports['match'] }),
  });
  if (parsed.success) return { ok: true, matcher: parsed.data };
  return {
    ok: false,
    error: parsed.error.issues.map((issue) => issue.message).join('; '),
  };
}

export function waitUntilTimeError(ports: PortValues): string | null {
  const hasMoment = ports['at'] !== undefined;
  const hasClock = ports['clock'] !== undefined;
  if (hasMoment === hasClock) {
    return `set either "at" or "clock" on a wait until, got ${hasMoment ? 'both' : 'neither'}`;
  }
  return null;
}
