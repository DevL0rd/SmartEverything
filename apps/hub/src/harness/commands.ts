import { ensureAttached } from './attach';
import { randomUUID } from 'node:crypto';
import {
  ApiError,
  AI_HARNESS_COMMAND_CATALOGUE,
  AI_HARNESS_COMMAND_OUTCOME,
  AI_HARNESS_COMMAND_WRITE,
} from '@smarteverything/domain';
import type {
  AiHarnessCommandOutcome,
  AiHarnessCommandScope,
  AiHarnessCommandWrite,
  AiHarnessSession,
} from '@smarteverything/domain';
import type { ChatOwner } from '../assistant/chat-directory';
import type { HarnessService } from './service';

interface CommandContext {
  readonly owner: ChatOwner;
  readonly chatId: string;
  readonly clientId: string;
}

export async function listHarnessCommands(
  service: HarnessService,
  context: CommandContext,
  input: AiHarnessCommandScope,
): Promise<ReturnType<typeof AI_HARNESS_COMMAND_CATALOGUE.parse>> {
  const { target, scope } = await commandSession(service, context, input);
  const receipt = await service.directory.execute(target, randomUUID(), {
    ...scope,
    kind: 'command_list',
  });
  if (receipt.commands === undefined)
    throw new ApiError('conflict', 'Native command discovery returned no effective registry.');
  return AI_HARNESS_COMMAND_CATALOGUE.parse({
    session_id: receipt.session_id,
    epoch: receipt.epoch,
    commands: receipt.commands,
  });
}

export async function executeHarnessCommand(
  service: HarnessService,
  context: CommandContext,
  raw: AiHarnessCommandWrite,
): Promise<AiHarnessCommandOutcome> {
  const input = AI_HARNESS_COMMAND_WRITE.parse(raw);
  const { target, scope } = await commandSession(service, context, input);
  const receipt = await service.directory.execute(target, input.operation_id, {
    ...scope,
    kind: 'command',
    line: input.line,
    attachments: input.attachments,
  });
  if (receipt.command_outcome === undefined)
    throw new ApiError('conflict', 'Native command execution returned no direct outcome.');
  return AI_HARNESS_COMMAND_OUTCOME.parse(receipt.command_outcome);
}

async function commandSession(
  service: HarnessService,
  context: CommandContext,
  input: AiHarnessCommandScope,
): Promise<{ readonly target: AiHarnessSession['target']; readonly scope: AiHarnessCommandScope }> {
  const session = await ensureAttached(service, context, input.expected_epoch);
  if (session.session_id !== input.session_id || session.epoch === null)
    throw new ApiError('conflict', 'These commands need the current native session and epoch.');
  const host = service.directory.registered(session.target).host;
  if (host.manifest?.human_commands !== true)
    throw new ApiError('conflict', 'This execution host does not advertise native human commands.');
  return {
    target: session.target,
    scope: { session_id: session.session_id, expected_epoch: session.epoch },
  };
}
