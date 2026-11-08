import { randomUUID } from 'node:crypto';
import { expect, vi } from 'vitest';
import type { AiHarnessEvent, DshWriterClaim } from '@smarteverything/domain';
import {
  HELPER_SETTLEMENT_PROOF,
  HELPER_SETTLEMENT_PROOF_DATA,
} from '../../src/host/helper-settlement-proof';
import type { DispatcherFixture } from './dispatcher';

export const TASK = 'Check the garage lights';

export function route(
  host: DispatcherFixture,
  parentId: string,
  child: 'hang' | 'finish',
  selection: Readonly<Record<string, unknown>> = {},
): void {
  const { model } = host;
  let delegated = false;
  model.guard = (options): void => {
    if (options.sessionId !== parentId)
      model.script(child === 'hang' ? { kind: 'hang' } : { kind: 'text', text: 'Lights are off.' });
    else if (!delegated) {
      delegated = true;
      model.script({
        kind: 'tool',
        id: 'd1',
        name: 'subagent',
        input: { description: 'garage', prompt: TASK, ...selection },
      });
    } else model.script({ kind: 'text', text: 'delegated' });
  };
}

export function runningChild(
  host: DispatcherFixture,
  parent: string,
): Promise<Extract<AiHarnessEvent, { kind: 'state' }>> {
  return vi.waitFor(() => {
    const active = host.published.find(
      (event) =>
        event.kind === 'state' && event.session_id !== parent && event.session.state === 'working',
    );
    if (active?.kind !== 'state') throw new Error('No running state for the automatic child.');
    return active;
  });
}

export async function waitForHelperSettlement(
  host: DispatcherFixture,
  parentId: string,
  child: Extract<AiHarnessEvent, { kind: 'state' }>,
): Promise<void> {
  await vi.waitFor(() => {
    const last = host.published.findLast(
      (event) => event.kind === 'state' && event.session_id === parentId,
    );
    expect(last).toMatchObject({ session: { state: 'idle' } });
    expect(host.frames).toContainEqual(
      expect.objectContaining({
        kind: 'close',
        session_id: child.session_id,
      }),
    );
    expect(
      host.model.requests.some(
        (request) =>
          request.sessionId === parentId &&
          request.messages.some(
            (message) => message.role === 'user' && message.source?.kind === 'subagent-settled',
          ),
      ),
    ).toBe(true);
  });
  await vi.waitFor(() => {
    const proofs = host.persistence.history(parentId).flatMap((event) => {
      if (
        typeof event !== 'object' ||
        event === null ||
        !('type' in event) ||
        event.type !== HELPER_SETTLEMENT_PROOF ||
        !('data' in event)
      )
        return [];
      return [HELPER_SETTLEMENT_PROOF_DATA.parse(event.data)];
    });
    expect(proofs).toContainEqual(
      expect.objectContaining({ childSessionId: child.session_id, writerEpoch: child.epoch }),
    );
  });
}

export async function replaceWriter(
  host: DispatcherFixture,
  parent: DshWriterClaim,
  child: Extract<AiHarnessEvent, { kind: 'state' }>,
): Promise<number> {
  const directory = child.session.directory;
  if (directory === null) throw new Error('The helper has no working directory.');
  host.persistence.lose(child.session_id);
  const { runtime_instance, connection_generation } = parent;
  const claim = {
    ...host.persistence.readmit(child.session_id),
    runtime_instance,
    connection_generation,
  };
  const open = host.frames.filter((frame) => frame.kind === 'open').length;
  const result = await host.dispatcher.execute(randomUUID(), {
    kind: 'open',
    mode: 'continue',
    continuation_parent: { session_id: parent.session_id, epoch: parent.epoch },
    chat_id: child.chat_id,
    claim,
    route: host.route,
    permission: child.session.permission,
    cwd: directory.path,
  });
  expect(result).toMatchObject({ epoch: claim.epoch, state: 'ready' });
  expect(host.frames.filter((frame) => frame.kind === 'open')).toHaveLength(open);
  expect(host.dispatcher.hasSession(claim.session_id, claim.epoch)).toBe(false);
  return claim.epoch;
}
