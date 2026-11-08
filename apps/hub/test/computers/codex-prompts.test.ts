import { spawn } from 'node:child_process';
import type { CodexPrompt } from '@smarteverything/domain';
import { expect, it, vi } from 'vitest';
import { CodexClient } from '../../src/codex/client';
import { CodexPrompts } from '../../src/codex/prompts';
import { captureLogs, testLogger } from '../support/logs';

const METHOD = 'item/commandExecution/requestApproval';
const SCOPE = { threadId: 'test-thread', turnId: 'test-turn', itemId: 'test-item' };

it('publishes and answers an approval amendment whose serialized details exceed 500 characters', () => {
  const command = 'long-argument '.repeat(50);
  const amendment = {
    acceptWithExecpolicyAmendment: { execpolicy_amendment: ['sh', '-c', command] },
  };
  const client = { respond: vi.fn(), reject: vi.fn(), rejectInvalidRequest: vi.fn() };
  const publish = vi.fn<(prompt: CodexPrompt) => void>();
  const prompts = new CodexPrompts(client, publish);
  prompts.receive(
    METHOD,
    { ...SCOPE, startedAtMs: 0, availableDecisions: ['accept', amendment, 'decline'] },
    1,
  );

  const [prompt] = prompts.list();
  if (prompt?.kind !== 'command_approval') throw new Error('Expected a command approval prompt');
  expect(publish).toHaveBeenCalledWith(prompt);
  expect(prompt.choices[1]).toEqual({
    id: '1',
    label: 'Allow matching commands',
    value: amendment,
  });
  prompts.answer(prompt.id, { kind: 'approval', choice_id: '1' });
  expect(client.respond).toHaveBeenCalledWith(1, { decision: amendment });
  expect(client.rejectInvalidRequest).not.toHaveBeenCalled();
});

it('logs malformed approval details and rejects only that request, leaving the socket usable', () => {
  const logs = captureLogs();
  const child = spawn(process.execPath, ['-e', 'process.stdin.resume()']);
  const write = vi.spyOn(child.stdin, 'write');
  const closed = vi.fn<(cause: Error) => void>();
  const client = new CodexClient({
    process: child,
    log: testLogger('codex'),
    mode: 'provider',
    received: (method, params, id): void => {
      if (id !== null) prompts.receive(method, params, id);
    },
    closed,
  });
  const prompts = new CodexPrompts(client, (): void => undefined);
  try {
    child.stdout.emit(
      'data',
      Buffer.from(`${JSON.stringify({ id: 1, method: METHOD, params: SCOPE })}\n`),
    );
    expect(write).toHaveBeenCalledWith(
      '{"id":1,"error":{"code":-32602,"message":"SmartEverything could not read this Codex request."}}\n',
    );
    expect(
      logs.records.find((entry) => entry.event === 'codex.server_request_invalid'),
    ).toMatchObject({
      payload: { method: METHOD, requestId: 1 },
    });
    expect(closed).not.toHaveBeenCalled();

    const params = { ...SCOPE, startedAtMs: 0, availableDecisions: ['accept'] };
    child.stdout.emit(
      'data',
      Buffer.from(`${JSON.stringify({ id: 2, method: METHOD, params })}\n`),
    );
    expect(prompts.list()).toMatchObject([
      { rpc_id: 2, kind: 'command_approval', status: 'pending' },
    ]);
  } finally {
    client.stop();
  }
});
