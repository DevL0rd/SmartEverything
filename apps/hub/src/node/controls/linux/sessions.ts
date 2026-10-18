import { z } from 'zod';
import type { RunProgram } from '../../run-program';

const SESSIONS = z.array(
  z.object({
    session: z.string().min(1),
    uid: z.number(),
    seat: z.string().nullable(),
    class: z.string(),
  }),
);

class UnknownUserError extends Error {
  override readonly name = 'UnknownUserError';

  constructor() {
    super('This system does not report which user SmartEverything runs as.');
  }
}

export function ownUid(): number {
  const uid = process.getuid?.();
  if (uid === undefined) {
    throw new UnknownUserError();
  }
  return uid;
}

export async function graphicalSession(run: RunProgram): Promise<string | null> {
  const uid = ownUid();
  const sessions = SESSIONS.parse(
    JSON.parse(await run('loginctl', ['list-sessions', '--json=short'])),
  );
  const found = sessions.find(
    (session) => session.uid === uid && session.seat !== null && session.class === 'user',
  );
  return found?.session ?? null;
}
