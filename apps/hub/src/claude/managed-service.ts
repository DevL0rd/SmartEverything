import {
  ApiError,
  type ClaudeCliAction,
  type ClaudeCliReceipt,
  type ClaudeCliSession,
  type ClaudeCliStart,
} from '@smarteverything/domain';
import {
  cliSession,
  currentClaudeActor,
  ownedClaudeScope,
  readyClaudeScope,
  type ManagedClaudeActor,
  type ManagedClaudeContext,
} from './managed-scope';
import { applyCliAction, validateCliAction } from './managed-operations';

export class ManagedClaudeService {
  private readonly controlling = new Set<string>();
  constructor(private readonly context: ManagedClaudeContext) {
    context.store.claudeCliOperations.recover();
  }
  list(
    actor: ManagedClaudeActor,
    deviceId: string,
    archived: boolean,
    limit: number,
  ): ClaudeCliSession[] {
    currentClaudeActor(this.context, actor);
    return this.context.store.claudeCliOperations
      .list(actor.profileId, deviceId)
      .map((binding) => ownedClaudeScope(this.context, actor, deviceId, binding.chat_id))
      .filter((scope) => (scope.chat.archived_at !== null) === archived)
      .sort((left, right) => right.chat.updated_at.localeCompare(left.chat.updated_at))
      .slice(0, limit)
      .map((scope) => cliSession(this.context, scope));
  }
  read(actor: ManagedClaudeActor, deviceId: string, chatId: string): ClaudeCliSession {
    return cliSession(this.context, ownedClaudeScope(this.context, actor, deviceId, chatId));
  }
  async start(
    actor: ManagedClaudeActor,
    deviceId: string,
    input: ClaudeCliStart,
  ): Promise<ClaudeCliReceipt> {
    currentClaudeActor(this.context, actor);
    const request = JSON.stringify({ deviceId, input });
    const known = this.context.store.claudeCliOperations.known(
      input.operation_id,
      actor.profileId,
      deviceId,
      request,
    );
    if (known !== undefined) return known;
    readyClaudeScope(this.context, deviceId);
    const receipt = this.reserveStart(actor, deviceId, input, request);
    return this.deliver(receipt, () => {
      const message = this.context.assistant.send(
        actor,
        { ...input.message, client_message_id: input.operation_id },
        receipt.chat_id,
      );
      return Promise.resolve({ message_id: message.id, application: 'native' });
    });
  }
  private reserveStart(
    actor: ManagedClaudeActor,
    deviceId: string,
    input: ClaudeCliStart,
    request: string,
  ): ClaudeCliReceipt {
    return this.context.store.durableWrite(() => {
      const chat = this.context.assistant.createChat(actor, {
        engine: {
          kind: 'claude',
          device_id: deviceId,
          model: input.model,
          effort: input.effort,
          settings: input.settings,
        },
        ...(input.title === undefined ? {} : { title: input.title }),
      });
      this.context.store.claudeCliOperations.bind({
        chat_id: chat.id,
        profile_id: actor.profileId,
        device_id: deviceId,
        cwd: input.settings.cwd,
      });
      const receipt = this.pending(actor, {
        deviceId,
        chatId: chat.id,
        operationId: input.operation_id,
        action: 'start',
        sessionId: null,
        jobId: null,
      });
      this.context.store.claudeCliOperations.reserve(receipt, request);
      return receipt;
    });
  }
  async control(
    actor: ManagedClaudeActor,
    deviceId: string,
    chatId: string,
    action: ClaudeCliAction,
  ): Promise<ClaudeCliReceipt> {
    const scope = ownedClaudeScope(this.context, actor, deviceId, chatId);
    const request = JSON.stringify({ deviceId, chatId, action });
    const known = this.context.store.claudeCliOperations.known(
      action.operation_id,
      actor.profileId,
      deviceId,
      request,
    );
    if (known !== undefined) return known;
    if (this.controlling.has(chatId))
      throw new ApiError(
        'conflict',
        'Another CLI operation is awaiting acknowledgement in this chat.',
      );
    readyClaudeScope(this.context, deviceId);
    validateCliAction(this.context, scope, action);
    const receipt = this.pending(actor, {
      deviceId,
      chatId,
      operationId: action.operation_id,
      action: action.action,
      sessionId: action.session_id,
      jobId: action.job_id,
    });
    this.context.store.durableWrite(() => {
      this.context.store.claudeCliOperations.reserve(receipt, request);
    });
    this.controlling.add(chatId);
    try {
      return await this.deliver(receipt, () => applyCliAction(this.context, actor, scope, action));
    } finally {
      this.controlling.delete(chatId);
    }
  }
  private async deliver(
    receipt: ClaudeCliReceipt,
    apply: () => Promise<Pick<ClaudeCliReceipt, 'message_id' | 'application'>>,
  ): Promise<ClaudeCliReceipt> {
    try {
      const accepted = await apply();
      return this.context.store.claudeCliOperations.save({
        ...receipt,
        ...accepted,
        state: 'accepted',
      });
    } catch (cause) {
      return this.context.store.claudeCliOperations.save({
        ...receipt,
        state: 'unknown',
        reason:
          cause instanceof Error
            ? cause.message.slice(0, 2000)
            : 'The CLI operation was not acknowledged. Its outcome is unknown and it will not be repeated.',
      });
    }
  }
  private pending(
    actor: ManagedClaudeActor,
    target: {
      readonly deviceId: string;
      readonly chatId: string;
      readonly operationId: string;
      readonly action: ClaudeCliReceipt['action'];
      readonly sessionId: string | null;
      readonly jobId: string | null;
    },
  ): ClaudeCliReceipt {
    const { deviceId, chatId, operationId, action, sessionId, jobId } = target;
    const now = this.context.store.claudeCliOperations.timestamp();
    return {
      operation_id: operationId,
      profile_id: actor.profileId,
      device_id: deviceId,
      runtime: 'claude',
      chat_id: chatId,
      action,
      state: 'pending',
      session_id: sessionId,
      job_id: jobId,
      message_id: null,
      application: null,
      reason: null,
      created_at: now,
      updated_at: now,
    };
  }
}
