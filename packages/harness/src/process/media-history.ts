import type { Context } from '@deepseek-ai/cordis';
import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm';
import {
  freezeMessage,
  offloadedImageText,
  resolveImageAttachmentAccess,
} from '@deepseek-ai/dsh-llm';
import type { Session, SessionEvent, SessionSeq } from '@deepseek-ai/dsh-session';
import type { HarnessControlPersistence } from './contracts';
import { readNativeHistory } from './history';
import { HarnessRuntimeError } from '../host/errors';
import { cachedMediaText, type HarnessAttachment } from './attachments';
import { nativeImageNote, type NativeMediaNote } from './native-media-note';
import { originalMediaId } from './media-reference';

type Load = (sessionId: string, ids: readonly string[]) => AsyncIterable<HarnessAttachment>;
type MediaEvent = Extract<SessionEvent, { type: 'user/message' | 'tool/result' }>;

interface MediaScan {
  next: number;
  turnStart: { readonly turn: number; readonly seq: SessionSeq } | undefined;
  readonly images: Map<SessionSeq, MediaEvent>;
}

export function installMediaHistory(
  ctx: Context,
  ports: {
    readonly load: Load | undefined;
    readonly persistence: HarnessControlPersistence;
    readonly describe: NativeMediaNote | undefined;
  },
): void {
  const scans = new WeakMap<Session, MediaScan>();
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
      const scan = scans.get(session) ?? { next: 0, turnStart: undefined, images: new Map() };
      scans.set(session, scan);
      await absorbNewEvents(ctx, ports.persistence, { session, scan });
      if (scan.turnStart?.turn !== turn)
        throw new HarnessRuntimeError(
          'operation_failed',
          'The media history turn boundary is missing.',
        );
      await replaceOlderMedia(
        ctx,
        { session, images: scan.images, boundary: scan.turnStart.seq },
        { ...ports, signal },
      );
      return next();
    },
    { prepend: true },
  );
}

async function absorbNewEvents(
  ctx: Context,
  persistence: HarnessControlPersistence,
  input: { readonly session: Session; readonly scan: MediaScan },
): Promise<void> {
  const { session, scan } = input;
  await ctx.sessions.flush(session);
  const header = (await persistence.metadata(session.id)).header;
  const events = readNativeHistory(
    header,
    await persistence.read(session.id, { offset: scan.next }),
  );
  for (const event of events) {
    if (event.type === 'turn/start') scan.turnStart = { turn: event.data.turn, seq: event.seq };
    else if (
      (event.type === 'user/message' || event.type === 'tool/result') &&
      session.deriveEventMessage(event)?.content.some((block) => block.type === 'image') === true
    )
      scan.images.set(event.seq, event);
    scan.next = event.seq + 1;
  }
}

async function replaceOlderMedia(
  ctx: Context,
  input: {
    readonly session: Session;
    readonly images: Map<SessionSeq, MediaEvent>;
    readonly boundary: SessionSeq;
  },
  ports: {
    readonly load: Load | undefined;
    readonly signal: AbortSignal;
    readonly describe: NativeMediaNote | undefined;
  },
): Promise<void> {
  const { session, images, boundary } = input;
  for (const seq of [...session.surface.nodes]) {
    const event = images.get(seq);
    if (event === undefined || seq >= boundary) continue;
    const original = session.deriveEventMessage(event);
    if (original?.content.some((block) => block.type === 'image') !== true) continue;
    const content = await mediaHistoryContent(
      ctx,
      { sessionId: session.id, seq, eventType: event.type, content: original.content },
      ports,
    );
    ports.signal.throwIfAborted();
    replaceMedia(ctx, session, { seq, event, original, content });
    images.delete(seq);
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
