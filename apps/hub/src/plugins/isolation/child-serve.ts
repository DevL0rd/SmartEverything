import process from 'node:process';
import { FRAME, READY_EVENT, type Frame } from './frames';
import { background, messageOf } from '@smarteverything/logging';

export interface ChildHandlers {
  readonly call: (name: string, payload: unknown) => Promise<unknown>;
  readonly event: (name: string, payload: unknown) => void;
}

export interface ChildChannel {
  readonly emit: (name: string, payload: unknown) => void;
}

function send(frame: Frame): void {
  process.send?.(frame);
}

function die(cause: unknown): void {
  process.stderr.write(
    `${cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)}\n`,
  );
  process.kill(process.pid, 'SIGKILL');
}

async function answer(
  handlers: ChildHandlers,
  id: number,
  name: string,
  payload: unknown,
): Promise<void> {
  try {
    send({
      kind: 'reply',
      id,
      ok: true,
      payload: await handlers.call(name, payload),
      error: null,
    });
  } catch (cause) {
    send({
      kind: 'reply',
      id,
      ok: false,
      payload: null,
      error: messageOf(cause),
    });
  }
}

export function serveChild(handlers: ChildHandlers): ChildChannel {
  process.on('message', (raw) => {
    const frame = FRAME.safeParse(raw);
    if (!frame.success) {
      die(frame.error);
    } else if (frame.data.kind === 'call') {
      background(
        answer(handlers, frame.data.id, frame.data.name, frame.data.payload),
        'child_serve.answer_failed',
      );
    } else if (frame.data.kind === 'event') {
      handlers.event(frame.data.name, frame.data.payload);
    }
  });
  process.on('disconnect', () => {
    process.kill(process.pid, 'SIGKILL');
  });
  process.on('uncaughtException', die);
  process.on('unhandledRejection', die);
  const channel: ChildChannel = {
    emit: (name, payload): void => {
      send({ kind: 'event', name, payload });
    },
  };
  channel.emit(READY_EVENT, null);
  return channel;
}
