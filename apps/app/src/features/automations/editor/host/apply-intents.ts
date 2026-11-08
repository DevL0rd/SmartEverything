import { z } from 'zod';
import { planDuplicate, planPaste, planCopy } from './clipboard-port';
import { CONNECT_REQUEST, planConnect } from './connect-intent';
import { DELETE_REQUEST, planDelete } from './delete-intent';
import { DISCONNECT_REQUEST, planDisconnect } from './disconnect-intent';
import { INSERT_REQUEST, planInsert } from './insert-intent';
import {
  commit,
  failed,
  shownDocument,
  type CanvasPoint,
  type GraphDocument,
  type IntentEnv,
  type IntentOutcome,
  type Planned,
} from './intent-env';
import { MOVE_REQUEST, planMove, planTidy } from './move-intent';
import { WRAP_REQUEST, planWrap } from './wrap-intent';

const POINT = z.strictObject({ x: z.number(), y: z.number() });

export const GRAPH_INTENT = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('insert'), request: INSERT_REQUEST }),
  z.strictObject({ type: z.literal('connect'), request: CONNECT_REQUEST }),
  z.strictObject({ type: z.literal('disconnect'), request: DISCONNECT_REQUEST }),
  z.strictObject({ type: z.literal('delete'), request: DELETE_REQUEST }),
  z.strictObject({ type: z.literal('wrap'), request: WRAP_REQUEST }),
  z.strictObject({ type: z.literal('move'), request: MOVE_REQUEST }),
  z.strictObject({ type: z.literal('tidy') }),
  z.strictObject({ type: z.literal('copy') }),
  z.strictObject({ type: z.literal('cut') }),
  z.strictObject({ type: z.literal('paste'), at: POINT.optional() }),
  z.strictObject({ type: z.literal('duplicate') }),
]);

export type GraphIntent = z.infer<typeof GRAPH_INTENT>;

export class InvalidGraphIntentError extends Error {
  override readonly name = 'InvalidGraphIntentError';

  constructor(readonly issues: readonly string[]) {
    super(`The canvas sent an intent outside its contract: ${issues.join('; ')}.`);
  }
}

export function parseGraphIntent(raw: unknown): GraphIntent {
  const parsed = GRAPH_INTENT.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new InvalidGraphIntentError(
    parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  );
}

interface Subject {
  readonly doc: GraphDocument;
  readonly selection: readonly string[];
  readonly env: IntentEnv;
}

type Immediate = Exclude<GraphIntent, { type: 'copy' | 'cut' | 'paste' }>;

function planImmediate(intent: Immediate, subject: Subject): Planned {
  const kinds = subject.env.runtime.kinds;
  const { doc, selection, env } = subject;
  switch (intent.type) {
    case 'insert':
      return planInsert(doc, intent.request, env.runtime);
    case 'connect':
      return planConnect(doc, intent.request, env.runtime.kinds);
    case 'disconnect':
      return planDisconnect(doc, intent.request, kinds);
    case 'delete':
      return planDelete(doc, intent.request, kinds);
    case 'wrap':
      return planWrap(doc, intent.request, env.runtime);
    case 'move':
      return planMove(doc, intent.request);
    case 'tidy':
      return planTidy(doc, env.runtime);
    case 'duplicate':
      return planDuplicate(doc, selection, env.runtime);
  }
}

function copied(announcement: string, doc: GraphDocument): IntentOutcome {
  return {
    ok: true,
    changed: false,
    program: doc.program,
    layout: doc.layout,
    selection: undefined,
    announcement,
  };
}

async function runCopy(subject: Subject, verb: 'Copied' | 'Cut'): Promise<IntentOutcome> {
  const kinds = subject.env.runtime.kinds;
  const result = planCopy(subject.doc, subject.selection, verb, kinds);
  if (!result.ok) return failed(result.reason);
  await subject.env.clipboard.write(result.text);
  return copied(result.announcement, subject.doc);
}

async function runCut(subject: Subject): Promise<IntentOutcome> {
  const kinds = subject.env.runtime.kinds;
  const copy = await runCopy(subject, 'Cut');
  if (!copy.ok) return copy;
  const removal = commit(
    subject.env.store,
    planDelete(subject.doc, { ids: [...subject.selection] }, kinds),
    subject.env.runtime,
  );
  return removal.ok ? { ...removal, announcement: copy.announcement } : removal;
}

async function runPaste(subject: Subject, at: CanvasPoint | undefined): Promise<IntentOutcome> {
  const text = await subject.env.clipboard.read();
  const planned = planPaste(subject.doc, text, at, subject.env.runtime);
  return commit(subject.env.store, planned, subject.env.runtime);
}

export async function applyGraphIntent(
  intent: GraphIntent,
  env: IntentEnv,
): Promise<IntentOutcome> {
  const state = env.store.state.get();
  const subject: Subject = {
    doc: shownDocument({ program: state.program, layout: state.layout }, env.runtime),
    selection: state.selection.ids,
    env,
  };
  if (intent.type === 'copy') return runCopy(subject, 'Copied');
  if (intent.type === 'cut') return runCut(subject);
  if (intent.type === 'paste') return runPaste(subject, intent.at);
  return commit(env.store, planImmediate(intent, subject), env.runtime);
}
