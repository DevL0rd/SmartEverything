import type { Context } from '@deepseek-ai/cordis';
import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm';
import {
  freezeMessage,
  offloadedImageText,
  resolveImageAttachmentAccess,
} from '@deepseek-ai/dsh-llm';
import type { Session, SessionEvent, SessionSeq } from '@deepseek-ai/dsh-session';
import { HarnessRuntimeError } from '../host/errors';
import { cachedMediaText, type HarnessAttachment } from './attachments';
import { originalMediaId } from './media-reference';
import type { HarnessControlPersistence } from './contracts';
import { readNativeHistory } from './history';
import { nativeImageNote, type NativeMediaNote } from './native-media-note';

type Load = (sessionId: string, ids: readonly string[]) => AsyncIterable<HarnessAttachment>;
type MediaEvent = Extract<SessionEvent, { type: 'user/message' | 'tool/result' }>;

export function installMediaHistory(
  ctx: Context,
  ports: {
    readonly load: Load | undefined;
    readonly persistence: HarnessControlPersistence;
    readonly describe: NativeMediaNote | undefined;
  },
): void {
  ctx.on(
    'agent/pre-step',
    async ({ agent, turn, signal }, next) => {
      const session = agent.session;
      if (
        !session
          .deriveMessages()
          .some((message) => message.content.some((block) => block.type === 'image'))
      )
        return next();
      await ports.persistence.verify(ports.persistence.claim(session.id));
      await ctx.sessions.flush(session);
      const metadata = await ports.persistence.metadata(session.id);
      const events = readNativeHistory(metadata.header, await ports.persistence.read(session.id));
      const boundary = events.find(
        (event) => event.type === 'turn/start' && event.data.turn === turn,
      )?.seq;
      if (boundary === undefined)
        throw new HarnessRuntimeError(
          'operation_failed',
          'The media history turn boundary is missing.',
        );
      await replaceOlderMedia(ctx, { session, events, boundary }, { ...ports, signal });
      return next();
    },
    { prepend: true },
  );
}

async function replaceOlderMedia(
  ctx: Context,
  input: {
    readonly session: Session;
    readonly events: readonly SessionEvent[];
    readonly boundary: SessionSeq;
  },
  ports: {
    readonly load: Load | undefined;
    readonly signal: AbortSignal;
    readonly describe: NativeMediaNote | undefined;
  },
): Promise<void> {
  const { session, events, boundary } = input;
  const bySeq = new Map(events.map((event) => [event.seq, event]));
  for (const seq of [...session.surface.nodes]) {
    if (seq >= boundary) continue;
    const event = bySeq.get(seq);
    if (event?.type !== 'user/message' && event?.type !== 'tool/result') continue;
    const original = session.deriveEventMessage(event);
    if (original?.content.some((block) => block.type === 'image') !== true) continue;
    const content = await mediaHistoryContent(
      ctx,
      { sessionId: session.id, seq, eventType: event.type, content: original.content },
      ports,
    );
    ports.signal.throwIfAborted();
    replaceMedia(ctx, session, { seq, event, original, content });
  }
}

async function mediaHistoryContent(
  ctx: Context,
  input: {
    readonly sessionId: string;
    readonly seq: SessionSeq;
    readonly eventType: MediaEvent['type'];
    readonly content: readonly ContentBlock[];
  },
  ports: {
    readonly load: Load | undefined;
    readonly signal: AbortSignal;
    readonly describe: NativeMediaNote | undefined;
  },
): Promise<ContentBlock[]> {
  const blocks: ContentBlock[] = [];
  let imageIndex = 0;
  for (const block of input.content) {
    if (block.type !== 'image') {
      blocks.push(block);
      continue;
    }
    const text = await imageHistoryText(ctx, { ...input, image: block, imageIndex }, ports);
    blocks.push({ type: 'text', text });
    imageIndex += 1;
  }
  return blocks;
}

async function imageHistoryText(
  ctx: Context,
  input: {
    readonly sessionId: string;
    readonly seq: SessionSeq;
    readonly eventType: MediaEvent['type'];
    readonly image: Extract<ContentBlock, { type: 'image' }>;
    readonly imageIndex: number;
  },
  ports: {
    readonly load: Load | undefined;
    readonly signal: AbortSignal;
    readonly describe: NativeMediaNote | undefined;
  },
): Promise<string> {
  const id = originalMediaId(input.image);
  if (input.eventType === 'user/message' && id !== undefined && ports.load !== undefined) {
    const notes: string[] = [];
    for await (const file of ports.load(input.sessionId, [id])) notes.push(cachedMediaText(file));
    if (notes.length !== 1 || notes[0] === undefined)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Cached media transfer must return exactly one original attachment.',
      );
    return notes[0];
  }
  if (ports.describe === undefined)
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'Older native image needs its authenticated media description service; retry on a host with this service available.',
    );
  const note = await nativeImageNote(ctx, { ...input, signal: ports.signal }, ports.describe);
  const access = resolveImageAttachmentAccess(
    ctx.attachments,
    (path) => ctx.get('fs')?.processPathFromHostPath(path),
    input.image.attachment,
  );
  return `${offloadedImageText(input.image.attachment, access)}\n${note}`;
}

function replaceMedia(
  ctx: Context,
  session: Session,
  input: {
    readonly seq: SessionSeq;
    readonly event: MediaEvent;
    readonly original: Message;
    readonly content: readonly ContentBlock[];
  },
): void {
  const { seq, event, original, content } = input;
  session.append('compaction/prune', {
    shadowedRange: { start: seq, end: seq },
    shadowedSeqs: [seq],
    shadowedTokenCount: ctx.tokenMeter.estimateMessage(original),
  });
  const intent = {
    surfaceOp: { op: 'replace' as const, startSeq: seq, endSeq: seq },
    sourceEventSeqs: [seq],
  };
  if (event.type === 'user/message')
    session.append('user/message', freezeMessage({ ...event.data, content }), intent);
  else
    session.append(
      'tool/result',
      {
        ...event.data,
        message: freezeMessage({ ...event.data.message, content }),
      },
      intent,
    );
}
