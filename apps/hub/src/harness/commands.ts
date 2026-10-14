import { stableHumanSession } from './stable-session';
import { Logger } from '@smarteverything/logging';
import { randomUUID } from 'node:crypto';
import {
  ApiError,
  AI_HARNESS_COMMAND_CATALOGUE,
  HARNESS_RUNTIME_RECEIPT,
  AI_HARNESS_COMMAND_OUTCOME,
  AI_HARNESS_COMMAND_WRITE,
  harnessTargetKey,
} from '@smarteverything/domain';
import type {
  AiHarnessCommandOutcome,
  AiHarnessCommandWrite,
  AiHarnessSession,
  AiHarnessCommandScope,
  HarnessRuntimeReceipt,
} from '@smarteverything/domain';
import type { ChatOwner } from '../assistant/chat-directory';
import type { HarnessService } from './service';

const log = new Logger('hub.harness');
const pending = new WeakMap<HarnessService, Map<string, Promise<AiHarnessCommandOutcome>>>();
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
  const refreshed = await stableHumanSession(service, context, input.expected_epoch);
  const scope = { ...input, expected_epoch: refreshed.epoch ?? input.expected_epoch };
  const session = admitCommands(service, context, scope);
  const id = randomUUID();
  const receipt = await service.directory.execute(session.target, id, {
    ...scope,
    kind: 'command_list',
  });
  admitCommands(service, context, scope);
  requireCommandReceipt(receipt, id, scope);
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
  if (service.store.harnessCoordination.operation(input.operation_id) !== undefined)
    return existingCommand(service, context, input);
  const refreshed = await stableHumanSession(service, context, input.expected_epoch);
  if (refreshed.epoch === null)
    throw new ApiError('conflict', 'The refreshed native writer has no epoch.');
  const effective = { ...input, expected_epoch: refreshed.epoch };
  const session = admitCommands(service, context, effective);
  const request = { kind: 'command' as const, ...input };
  const operation = service.store.harnessCoordination.operation(input.operation_id);
  const admitted = service.store.harnessCoordination.begin(
    input.operation_id,
    session.session_id,
    request,
  );
  if (admitted.state !== 'pending') {
    if (admitted.result === null)
      throw new ApiError('conflict', 'The native command has no settled receipt.');
    return Promise.resolve(AI_HARNESS_COMMAND_OUTCOME.parse(JSON.parse(admitted.result)));
  }
  const active = activeCommands(service);
  const existing = active.get(input.operation_id);
  if (existing !== undefined) return existing;
  if (operation !== undefined)
    throw new ApiError(
      'conflict',
      'This admitted command has an unconfirmed outcome and cannot be replayed.',
    );
  const result = runCommand(service, context, session, effective).finally(() => {
    active.delete(input.operation_id);
  });
  active.set(input.operation_id, result);
  return result;
}

function existingCommand(
  service: HarnessService,
  context: CommandContext,
  input: AiHarnessCommandWrite,
): Promise<AiHarnessCommandOutcome> {
  const session = service.state(context.owner, context.chatId);
  if (session.session_id !== input.session_id)
    throw new ApiError('forbidden', 'Command receipt belongs to another session.');
  const connection = service.directory.registered(session.target);
  service.admitTarget(context.owner, connection.host, connection.actor.id, context.clientId);
  const operation = service.store.harnessCoordination.begin(
    input.operation_id,
    session.session_id,
    { kind: 'command', ...input },
  );
  if (operation.state !== 'pending' && operation.result !== null)
    return Promise.resolve(AI_HARNESS_COMMAND_OUTCOME.parse(JSON.parse(operation.result)));
  const active = activeCommands(service).get(input.operation_id);
  if (active !== undefined) return active;
  throw new ApiError(
    'conflict',
    'This admitted command has an unconfirmed outcome and cannot be replayed.',
  );
}

async function runCommand(
  service: HarnessService,
  context: CommandContext,
  session: AiHarnessSession,
  input: AiHarnessCommandWrite,
): Promise<AiHarnessCommandOutcome> {
  let receipt: HarnessRuntimeReceipt;
  try {
    receipt = await service.directory.execute(session.target, input.operation_id, {
      kind: 'command',
      session_id: session.session_id,
      expected_epoch: input.expected_epoch,
      line: input.line,
      attachments: input.attachments,
    });
  } catch (cause) {
    if (
      cause instanceof ApiError &&
      (cause.code === 'forbidden' || cause.code === 'unauthorized')
    ) {
      retainUnknownOutcome(service, input);
      throw cause;
    }
    return uncertainCommandOutcome(service, context, input, cause);
  }
  let outcome: AiHarnessCommandOutcome;
  try {
    admitCommands(service, context, input);
    requireCommandReceipt(receipt, input.operation_id, input);
    if (receipt.command_outcome === undefined)
      throw new ApiError('conflict', 'Native command execution returned no direct outcome.');
    outcome = AI_HARNESS_COMMAND_OUTCOME.parse(receipt.command_outcome);
  } catch (cause) {
    retainUnknownOutcome(service, input);
    throw cause;
  }
  try {
    service.store.harnessCoordination.finish(input.operation_id, outcome);
    return outcome;
  } catch (cause) {
    return uncertainCommandOutcome(service, context, input, cause);
  }
}

function retainUnknownOutcome(
  service: HarnessService,
  input: AiHarnessCommandWrite,
): AiHarnessCommandOutcome {
  const outcome = AI_HARNESS_COMMAND_OUTCOME.parse({
    status: 'unknown',
    message:
      'Command settlement or durability is unconfirmed; this operation will not be replayed.',
  });
  service.store.harnessCoordination.finish(input.operation_id, outcome, 'unknown');
  return outcome;
}

function uncertainCommandOutcome(
  service: HarnessService,
  context: CommandContext,
  input: AiHarnessCommandWrite,
  cause: unknown,
): AiHarnessCommandOutcome {
  const outcome = retainUnknownOutcome(service, input);
  admitCommandAuthority(service, context, input);
  log.error('command.outcome_unknown', cause, { operation_id: input.operation_id });
  return outcome;
}

function activeCommands(service: HarnessService): Map<string, Promise<AiHarnessCommandOutcome>> {
  const existing = pending.get(service);
  if (existing !== undefined) return existing;
  const active = new Map<string, Promise<AiHarnessCommandOutcome>>();
  pending.set(service, active);
  return active;
}

function admitCommands(
  service: HarnessService,
  context: CommandContext,
  input: AiHarnessCommandScope,
): AiHarnessSession {
  const session = admitCommandAuthority(service, context, input);
  service.directory.get(session.target);
  return session;
}

function admitCommandAuthority(
  service: HarnessService,
  context: CommandContext,
  input: AiHarnessCommandScope,
): AiHarnessSession {
  const session = service.state(context.owner, context.chatId);
  if (
    session.session_id !== input.session_id ||
    session.epoch !== input.expected_epoch ||
    session.state === 'switching'
  )
    throw new ApiError(
      'conflict',
      'Human commands require the current stable native session and epoch.',
    );
  const connection = service.directory.registered(session.target);
  const host = connection.host;
  service.admitTarget(context.owner, host, connection.actor.id, context.clientId);
  if (host.manifest?.human_commands !== true)
    throw new ApiError('conflict', 'This execution host does not advertise native human commands.');
  verifyCommandWriter(service, context, session, input);
  if (service.store.harnessCoordination.permissionChange(session.session_id) !== null)
    throw new ApiError(
      'conflict',
      'Confirm the pending native policy change before running commands.',
    );
  return session;
}

function verifyCommandWriter(
  service: HarnessService,
  context: CommandContext,
  session: AiHarnessSession,
  input: AiHarnessCommandScope,
): void {
  const host = service.directory.registered(session.target).host;
  const grant = service.storage.grant(session.session_id);
  if (
    grant.runtime_instance !== host.runtime_instance ||
    grant.generation !== host.connection_generation ||
    harnessTargetKey(grant.target) !== harnessTargetKey(host.target)
  )
    throw new ApiError('forbidden', 'Human command authority belongs to another host generation.');
  const writer = service.store.dshSessions.writerState(session.session_id, context.owner.profileId);
  if (writer.claim?.epoch !== input.expected_epoch)
    throw new ApiError('conflict', 'Human commands have no current native writer.');
  service.store.dshSessions.verifyWriter(
    writer.claim,
    service.hostPrincipal(context.owner.profileId, host),
  );
}

function requireCommandReceipt(
  raw: HarnessRuntimeReceipt,
  id: string,
  input: AiHarnessCommandScope,
): void {
  const receipt = HARNESS_RUNTIME_RECEIPT.parse(raw);
  if (
    receipt.operation_id !== id ||
    receipt.session_id !== input.session_id ||
    receipt.epoch !== input.expected_epoch ||
    receipt.state !== 'completed'
  )
    throw new ApiError(
      'forbidden',
      'Native command receipt differs from the exact admitted operation.',
    );
}
