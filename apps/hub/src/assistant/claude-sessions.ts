import { createHash } from 'node:crypto';
import { createConnection } from 'node:net';
import { access, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { claudeConfigDirectory } from './environment';
import { errorCode, isMissing, isUnreadableJson } from './errors';
import { watchDirectory } from './file-watch';
import { handlesScheme, openUrl } from './open-url';

export interface LiveSession {
  readonly pid: number;
  readonly sessionId: string;
  readonly cwd: string;
  readonly socket: string;
  readonly entrypoint: string | null;
  readonly status: string | null;
}

const SESSION_FILE = z.looseObject({
  pid: z.int(),
  sessionId: z.string().min(1),
  cwd: z.string().optional(),
  messagingSocketPath: z.string().min(1),
  entrypoint: z.string().optional(),
  status: z.string().optional(),
});

const PEER_KEY = z.looseObject({ peerToken: z.string().min(1) });

const DELIVERY_TIMEOUT_MS = 10_000;
const FIRST_OPEN_MS = 15_000;
const OPEN_MS = 90_000;

export class SessionDeliveryError extends Error {
  override readonly name = 'SessionDeliveryError';
}

function configDirectory(): string {
  return claudeConfigDirectory();
}

export function sessionsDirectory(): string {
  return join(configDirectory(), 'sessions');
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    if (errorCode(cause) === 'EPERM') {
      return true;
    }
    if (errorCode(cause) !== 'ESRCH') {
      throw cause;
    }
    return false;
  }
}

async function entry(file: string): Promise<LiveSession | undefined> {
  const parsed = SESSION_FILE.safeParse(JSON.parse(await readFile(file, 'utf8')));
  if (!parsed.success || !alive(parsed.data.pid)) {
    return undefined;
  }
  const raw = parsed.data;
  return {
    pid: raw.pid,
    sessionId: raw.sessionId,
    socket: raw.messagingSocketPath,
    cwd: raw.cwd ?? '',
    entrypoint: raw.entrypoint ?? null,
    status: raw.status ?? null,
  };
}

async function readableEntry(file: string): Promise<LiveSession | undefined> {
  try {
    return await entry(file);
  } catch (cause) {
    if (!isUnreadableJson(cause)) {
      throw cause;
    }
    return undefined;
  }
}

async function sessionFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).filter((name) => name.endsWith('.json'));
  } catch (cause) {
    if (!isMissing(cause)) {
      throw cause;
    }
    return [];
  }
}

export async function liveSession(
  sessionId: string,
  directory = sessionsDirectory(),
): Promise<LiveSession | undefined> {
  for (const name of await sessionFiles(directory)) {
    const found = await readableEntry(join(directory, name));
    if (found?.sessionId === sessionId) {
      return found;
    }
  }
  return undefined;
}

async function peerToken(session: Pick<LiveSession, 'pid' | 'socket'>): Promise<string | null> {
  const digest = createHash('sha256').update(resolve(session.socket)).digest('hex');
  const path = join(sessionsDirectory(), `${String(session.pid)}.${digest}.key`);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (cause) {
    if (!isMissing(cause)) {
      throw cause;
    }
    return null;
  }
  return PEER_KEY.parse(JSON.parse(text)).peerToken;
}

export async function deliver(
  session: Pick<LiveSession, 'pid' | 'socket'>,
  text: string,
): Promise<void> {
  const token = await peerToken(session);
  const frames = [
    ...(token === null ? [] : [{ type: 'auth', token }]),
    { type: 'user', message: { role: 'user', content: text } },
  ];
  const payload = frames.map((frame) => `${JSON.stringify(frame)}\n`).join('');
  await new Promise<void>((done, fail) => {
    const connection = createConnection(session.socket, () => {
      connection.end(payload, () => {
        done();
      });
    });
    connection.setTimeout(DELIVERY_TIMEOUT_MS, () => {
      connection.destroy(
        new SessionDeliveryError('The Claude session did not accept the message in time'),
      );
    });
    connection.on('error', fail);
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (cause) {
    if (!isMissing(cause)) {
      throw cause;
    }
    return false;
  }
}

export async function transcriptPath(sessionId: string): Promise<string | undefined> {
  const projects = join(configDirectory(), 'projects');
  let folders: string[];
  try {
    folders = await readdir(projects);
  } catch (cause) {
    if (!isMissing(cause)) {
      throw cause;
    }
    return undefined;
  }
  for (const folder of folders) {
    const path = join(projects, folder, `${sessionId}.jsonl`);
    if (await exists(path)) {
      return path;
    }
  }
  return undefined;
}

export async function conversationExists(sessionId: string): Promise<boolean> {
  return (await transcriptPath(sessionId)) !== undefined;
}

export function desktopInstalled(): Promise<boolean> {
  return handlesScheme('claude');
}

function waitForSession(sessionId: string, waitMs: number): Promise<LiveSession | undefined> {
  return new Promise((done) => {
    let finished = false;
    const finish = (found: LiveSession | undefined): void => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      stop();
      done(found);
    };
    const check = (): void => {
      void liveSession(sessionId).then((found) => {
        if (found !== undefined) {
          finish(found);
        }
      });
    };
    const stop = watchDirectory(sessionsDirectory(), check, 100);
    const timer = setTimeout(() => {
      finish(undefined);
    }, waitMs);
    check();
  });
}

export async function showInDesktop(sessionId: string): Promise<void> {
  await openUrl(`claude://resume?session=${sessionId}`);
}

export async function openInDesktop(sessionId: string): Promise<LiveSession> {
  const existing = await liveSession(sessionId);
  if (existing !== undefined) {
    return existing;
  }
  await showInDesktop(sessionId);
  const first = await waitForSession(sessionId, FIRST_OPEN_MS);
  if (first !== undefined) {
    return first;
  }
  await showInDesktop(sessionId);
  const opened = await waitForSession(sessionId, OPEN_MS);
  if (opened === undefined) {
    throw new SessionDeliveryError('Claude Desktop did not open the assistant conversation');
  }
  return opened;
}
