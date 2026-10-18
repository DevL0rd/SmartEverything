import type { Context } from '@deepseek-ai/cordis';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';

const log = new Logger('hub.harness');

const SHORT_TOKEN = /^[\w\-.:/]{1,40}$/;

const TURN = z.looseObject({ turn: z.number().optional() });
const TURN_END = z.looseObject({
  turn: z.number().optional(),
  reason: z.looseObject({ kind: z.string().optional() }).optional(),
});
const ATTEMPT = z.looseObject({ stream: z.array(z.unknown()).optional() });
const CALL = z.looseObject({ callId: z.string(), name: z.string(), arguments: z.string() });
const RESULT = z.looseObject({
  message: z.looseObject({
    isError: z.boolean().optional(),
    source: z.looseObject({ callId: z.string() }),
    content: z.array(z.unknown()).optional(),
  }),
  error: z.looseObject({ name: z.string(), code: z.string() }).optional(),
});
const COMPACTION = z.looseObject({ error: z.unknown().optional() });

class Running {
  turn: number | undefined;
  turnStartedAt = 0;
  steps = 0;
  tools = 0;
  stepStartedAt = 0;
  readonly calls = new Map<string, { readonly name: string; readonly startedAt: number }>();

  beginTurn(turn: number | undefined, now: number): void {
    this.turn = turn;
    this.turnStartedAt = now;
    this.steps = 0;
    this.tools = 0;
    this.calls.clear();
  }

  beginStep(now: number): void {
    this.steps += 1;
    this.stepStartedAt = now;
  }

  request(callId: string, name: string, now: number): void {
    this.tools += 1;
    this.calls.set(callId, { name, startedAt: now });
  }
}

interface Beat {
  readonly id: string;
  readonly state: Running;
  readonly now: number;
  readonly data: unknown;
}

type Handler = (beat: Beat) => void;

const DETAIL_TYPES: ReadonlySet<string> = new Set([
  'approval/asked',
  'approval/decided',
  'approval/policy',
  'compaction/prune',
  'llm/retry-started',
  'model/selection',
  'permission/preset',
  'sandbox/mode',
  'plan/mode',
  'agent-preset/selected',
  'working-directory/change',
  'hook/invoked',
  'hook/result',
  'goal/change',
  'command/run',
  'command/done',
  'session/created',
  'session/disposed',
  'session/not-found',
  'agent/inbox/spliced',
]);

function scalarFields(data: unknown): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (typeof data !== 'object' || data === null) return fields;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'number' || typeof value === 'boolean') fields[key] = value;
    else if (typeof value === 'string' && SHORT_TOKEN.test(value)) fields[key] = value;
    else if (Array.isArray(value)) fields[`${key}Count`] = value.length;
  }
  return fields;
}

function elapsed(now: number, since: number): number {
  return Math.round(now - since);
}

const turnStarted: Handler = ({ id, state, now, data }) => {
  state.beginTurn(TURN.safeParse(data).data?.turn, now);
  log.info('turn.started', { session_id: id, turn: state.turn });
};

const turnEnded: Handler = ({ id, state, now, data }) => {
  log.info('turn.ended', {
    session_id: id,
    turn: state.turn,
    reason: TURN_END.safeParse(data).data?.reason?.kind,
    steps: state.steps,
    toolCalls: state.tools,
    durationMs: elapsed(now, state.turnStartedAt),
  });
  state.calls.clear();
};

const stepStarted: Handler = ({ id, state, now }) => {
  state.beginStep(now);
  log.debug('step.started', { session_id: id, turn: state.turn, step: state.steps });
};

const stepEnded: Handler = ({ id, state, now }) => {
  log.debug('step.ended', () => ({
    session_id: id,
    turn: state.turn,
    step: state.steps,
    durationMs: elapsed(now, state.stepStartedAt),
  }));
};

const attempted: Handler = ({ id, state, now, data }) => {
  log.debug('model.attempt_recorded', () => ({
    session_id: id,
    step: state.steps,
    frames: ATTEMPT.safeParse(data).data?.stream?.length,
    sinceStepMs: elapsed(now, state.stepStartedAt),
  }));
};

const toolRequested: Handler = ({ id, state, now, data }) => {
  const call = CALL.safeParse(data).data;
  if (call === undefined) return;
  state.request(call.callId, call.name, now);
  log.debug('tool.requested', {
    session_id: id,
    turn: state.turn,
    tool: call.name,
    call_id: call.callId,
    argumentChars: call.arguments.length,
    inFlight: state.calls.size,
  });
};

const toolCompleted: Handler = ({ id, state, now, data }) => {
  const result = RESULT.safeParse(data).data;
  if (result === undefined) return;
  const callId = result.message.source.callId;
  const call = state.calls.get(callId);
  state.calls.delete(callId);
  const fields = {
    session_id: id,
    tool: call?.name,
    call_id: callId,
    failed: result.message.isError === true,
    errorName: result.error?.name,
    errorCode: result.error?.code,
    parts: result.message.content?.length,
    durationMs: call === undefined ? undefined : elapsed(now, call.startedAt),
  };
  if (result.message.isError === true) log.warn('tool.failed', fields);
  else log.debug('tool.completed', fields);
};

const compactionStarted: Handler = ({ id, data }) => {
  log.info('compaction.started', { session_id: id, ...scalarFields(data) });
};

const compactionEnded: Handler = ({ id, data }) => {
  log.info('compaction.ended', {
    session_id: id,
    hasError: COMPACTION.safeParse(data).data?.error !== undefined,
    ...scalarFields(data),
  });
};

const HANDLERS: ReadonlyMap<string, Handler> = new Map([
  ['turn/start', turnStarted],
  ['turn/end', turnEnded],
  ['step/start', stepStarted],
  ['step/end', stepEnded],
  ['assistant/attempt', attempted],
  ['tool/call', toolRequested],
  ['tool/result', toolCompleted],
  ['compaction/start', compactionStarted],
  ['compaction/end', compactionEnded],
]);

export function observeSessionTrace(ctx: Context): void {
  const running = new Map<string, Running>();
  ctx.on('session/event', (session, event) => {
    const type: string = event.type;
    const id = session.id;
    const state = running.get(id) ?? new Running();
    running.set(id, state);
    const handler = HANDLERS.get(type);
    if (handler !== undefined) {
      handler({ id, state, now: performance.now(), data: event.data });
      return;
    }
    if (type === 'session/disposed') running.delete(id);
    if (DETAIL_TYPES.has(type)) {
      log.debug('session.event_recorded', () => ({
        session_id: id,
        type,
        ...scalarFields(event.data),
      }));
    }
  });
}
