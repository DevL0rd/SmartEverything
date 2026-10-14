import { z } from 'zod';
import { DSH_SESSION_EVENT, DSH_SESSION_HEADER } from '@smarteverything/domain';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session';
import {
  assertStoredId,
  assertVersion,
  validateStoredEvents,
} from '@deepseek-ai/dsh-session-persistence';

const NATIVE_EVENT = z.custom<SessionEvent>((value) => DSH_SESSION_EVENT.safeParse(value).success);
const NATIVE_EVENTS = z.array(NATIVE_EVENT);

export function nativeHeader(input: unknown): SessionHeader {
  const versioned = z.object({ id: z.string(), version: z.int() }).parse(input);
  assertVersion({ id: SessionId(versioned.id), version: versioned.version });
  const header = DSH_SESSION_HEADER.parse(input);
  const { parentSession, cwd, origin, delegationDepth, agentPreset, ...fields } = header;
  return Object.freeze({
    ...fields,
    id: SessionId(header.id),
    ...(cwd === undefined ? {} : { cwd }),
    ...(origin === undefined ? {} : { origin }),
    ...(delegationDepth === undefined ? {} : { delegationDepth }),
    ...(agentPreset === undefined ? {} : { agentPreset }),
    ...(parentSession === undefined ? {} : { parentSession: SessionId(parentSession) }),
  });
}

export function nativeEvents(header: SessionHeader, input: unknown): readonly SessionEvent[] {
  assertVersion(header);
  return validateStoredEvents(header, NATIVE_EVENTS.parse(input));
}

export function boundHeader(id: SessionId, input: unknown): SessionHeader {
  const header = nativeHeader(input);
  assertVersion(header);
  assertStoredId(id, header);
  return header;
}
