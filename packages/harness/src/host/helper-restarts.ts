import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { createUserMessage, MessageId } from '@deepseek-ai/dsh-llm';
import type { ContentBlock, UserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { directedHelperTurns } from './helper-turn-inputs';
import { hubNoteText } from './hub-note';

const CATALOGED = z.object({ childId: z.string().min(1) });
const TURN = z.object({ turn: z.int() });
const HOST_STOPPED = z.object({
  reason: z.object({ kind: z.literal('aborted'), reason: z.object({ kind: z.literal('parent') }) }),
});
const TEXT = z.object({ type: z.literal('text'), text: z.string().min(1) });
const ASSISTANT = z.object({ message: z.object({ content: z.array(z.unknown()) }) });
const IDENTIFIED = z.object({ id: z.string() });
const SPLICED = z.object({ inserted: z.array(IDENTIFIED) });

export interface InterruptedHelper {
  readonly childId: string;
  readonly noticeId: string;
  readonly closingText: readonly string[];
}

type Resumed = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export type HelperResume = (childId: string, content: ContentBlock[]) => Promise<unknown>;

export function catalogedHelpers(events: readonly SessionEvent[]): readonly string[] {
  return [
    ...new Set(
      events.flatMap((event) => {
        if (event.type !== 'subagent/catalog') return [];
        const entry = CATALOGED.safeParse(event.data);
        return entry.success ? [entry.data.childId] : [];
      }),
    ),
  ];
}

export function deliveredIds(events: readonly SessionEvent[]): ReadonlySet<string> {
  return new Set(
    events.flatMap((event) => {
      if (event.type === 'user/message') {
        const message = IDENTIFIED.safeParse(event.data);
        return message.success ? [message.data.id] : [];
      }
      if (event.type !== 'agent/inbox/spliced') return [];
      const splice = SPLICED.safeParse(event.data);
      return splice.success ? splice.data.inserted.map((message) => message.id) : [];
    }),
  );
}

function interruptedTurn(events: readonly SessionEvent[]): number | undefined {
  let open: number | undefined;
  let stopped: number | undefined;
  for (const event of events) {
    const turn = TURN.safeParse(event.data);
    if (!turn.success) continue;
    if (event.type === 'turn/start') {
      open = turn.data.turn;
      stopped = undefined;
    } else if (event.type === 'turn/end' && open === turn.data.turn) {
      open = undefined;
      stopped = HOST_STOPPED.safeParse(event.data).success ? turn.data.turn : undefined;
    }
  }
  return open ?? stopped;
}

function closingText(events: readonly SessionEvent[]): readonly string[] {
  for (const event of events.toReversed()) {
    if (event.type !== 'assistant/message') continue;
    const assistant = ASSISTANT.safeParse(event.data);
    if (!assistant.success) continue;
    const texts = assistant.data.message.content.flatMap((part) => {
      const text = TEXT.safeParse(part);
      return text.success ? [text.data.text] : [];
    });
    if (texts.length > 0) return texts;
  }
  return [];
}

function noticeId(childId: string, turn: number): string {
  const hex = createHash('sha256')
    .update(`${childId}:${String(turn)}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function interruptedHelper(
  childId: string,
  childEvents: readonly SessionEvent[],
  delivered: ReadonlySet<string>,
): InterruptedHelper | undefined {
  const turn = interruptedTurn(childEvents);
  if (turn === undefined || directedHelperTurns(childEvents).has(turn)) return undefined;
  const id = noticeId(childId, turn);
  if (delivered.has(id)) return undefined;
  return { childId, noticeId: id, closingText: closingText(childEvents) };
}

function resumeLine(resumed: Resumed): string {
  return resumed.ok
    ? 'Its host restarted while it was working. SmartEverything resumed it, so it carries on from where it stopped and reports when it finishes.'
    : `Its host restarted while it was working and SmartEverything could not resume it (${resumed.reason}). Send it a message to continue it.`;
}

export function helperNotice(helper: InterruptedHelper, resumed: Resumed): UserMessage {
  const summary = `Background subagent ${helper.childId} was interrupted by a host restart.`;
  const message = createUserMessage({
    content: [
      { type: 'text', text: summary },
      ...(helper.closingText.length === 0
        ? [{ type: 'text' as const, text: 'It left no closing message.' }]
        : [
            { type: 'text' as const, text: 'Its closing message:' },
            ...helper.closingText.map((text) => ({ type: 'text' as const, text })),
          ]),
      { type: 'text', text: resumeLine(resumed) },
    ],
    source: {
      kind: 'subagent-settled',
      form: 'notice',
      summary,
      senderSessionId: SessionId(helper.childId),
    },
  });
  return { ...message, id: MessageId(helper.noticeId) };
}

export const HELPER_RESUME_TEXT = hubNoteText(
  'Your host restarted while you were working. Continue the work you were doing.',
);

async function resumed(resume: HelperResume, childId: string): Promise<Resumed> {
  try {
    await resume(childId, [{ type: 'text', text: HELPER_RESUME_TEXT }]);
    return { ok: true };
  } catch (cause) {
    return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) };
  }
}

export async function reportInterruptedHelpers(
  agent: Agent,
  ports: {
    readonly live: (id: string) => boolean;
    readonly read: (id: string) => Promise<readonly SessionEvent[] | undefined>;
    readonly resume: HelperResume;
  },
): Promise<number> {
  const events = (await ports.read(agent.id)) ?? [];
  const delivered = deliveredIds(events);
  let reported = 0;
  for (const childId of catalogedHelpers(events)) {
    if (ports.live(childId)) continue;
    const childEvents = await ports.read(childId);
    if (childEvents === undefined) continue;
    const helper = interruptedHelper(childId, childEvents, delivered);
    if (helper === undefined) continue;
    const outcome = await resumed(ports.resume, childId);
    agent.send(
      helperNotice(helper, outcome),
      agent.status === 'idle' ? 'next-turn' : 'next-step',
      true,
    );
    reported += 1;
  }
  return reported;
}
