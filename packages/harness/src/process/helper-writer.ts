import { isDeepStrictEqual } from 'node:util';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { SessionId } from '@deepseek-ai/dsh-session';
import { harnessTargetKey } from '@smarteverything/domain';
import type {
  DshSessionMetadata,
  DshWriterClaim,
  HarnessRuntimeRequest,
} from '@smarteverything/domain';
import type { HarnessControlPersistence } from './contracts';
import { HarnessRuntimeError } from '../host/errors';

type Open = Extract<HarnessRuntimeRequest, { kind: 'open' }>;
interface Ports {
  readonly ctx: Context;
  readonly persistence: HarnessControlPersistence;
  readonly opened: ReadonlyMap<string, Open>;
}

export async function bindHelperWriter(input: Open, ports: Ports): Promise<void> {
  const { ctx, persistence } = ports;
  const { claim } = input;
  const id = SessionId(claim.session_id);
  const metadata = await persistence.metadata(id);
  const expected = adoptedParent(input, metadata);
  const parent = SessionId(expected.session_id);
  const { parentClaim, parentAgent } = exactParent(input, expected, ports);
  const alreadyBound = exactWriter(input, ports);
  await persistence.verify(claim);
  if (
    !isDeepStrictEqual(persistence.boundClaim(parent), parentClaim) ||
    ctx.agents.get(parent) !== parentAgent
  )
    throw new HarnessRuntimeError(
      'ownership_lost',
      'Helper writer ownership changed during admission.',
      id,
    );
  if (exactWriter(input, ports)) return;
  if (alreadyBound)
    throw new HarnessRuntimeError(
      'ownership_lost',
      'The helper writer was released during admission.',
      id,
    );
  persistence.bind(claim);
}

type Parent = NonNullable<Open['continuation_parent']>;

function adoptedParent(input: Open, metadata: DshSessionMetadata): Parent {
  const expected = input.continuation_parent;
  const parent = metadata.header.parentSession;
  if (
    metadata.chat_id !== input.chat_id ||
    metadata.header.origin !== 'subagent' ||
    parent === undefined ||
    expected?.session_id !== parent
  )
    throw new HarnessRuntimeError(
      'ownership_lost',
      'This writer must belong to an adopted helper.',
      input.claim.session_id,
    );
  return expected;
}

function exactParent(
  input: Open,
  expected: Parent,
  { ctx, persistence }: Ports,
): { readonly parentClaim: DshWriterClaim; readonly parentAgent: Agent } {
  const { claim } = input;
  const parent = SessionId(expected.session_id);
  const parentClaim = persistence.boundClaim(parent);
  const parentAgent = ctx.agents.get(parent);
  if (
    parentClaim?.runtime_instance !== claim.runtime_instance ||
    parentClaim.connection_generation !== claim.connection_generation ||
    parentClaim.epoch !== expected.epoch ||
    harnessTargetKey(parentClaim.target) !== harnessTargetKey(claim.target) ||
    parentAgent === undefined
  )
    throw new HarnessRuntimeError(
      'ownership_lost',
      'The exact parent is no longer on this host.',
      claim.session_id,
    );
  return { parentClaim, parentAgent };
}

function exactWriter(input: Open, ports: Ports): boolean {
  const { ctx, persistence, opened } = ports;
  const id = SessionId(input.claim.session_id);
  const existing = persistence.boundClaim(id);
  if (opened.has(id))
    throw new HarnessRuntimeError(
      'ownership_lost',
      'The helper is already open as a standalone conversation.',
      id,
    );
  if (isDeepStrictEqual(existing, input.claim)) return true;
  if (
    existing !== undefined ||
    ctx.agents.get(id) !== undefined ||
    ctx.sessions.get(id) !== undefined
  )
    throw new HarnessRuntimeError(
      'ownership_lost',
      'A competing helper writer is still present on this host.',
      id,
    );
  return false;
}
