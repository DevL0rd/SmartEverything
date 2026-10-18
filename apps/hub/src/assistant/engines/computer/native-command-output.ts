import {
  ApiError,
  type AiChatRow,
  type AiNativeCommandWrite,
  type AiNativeCommandReceipt,
} from '@smarteverything/domain';
import {
  commandAuthority,
  manualCommandCaller,
  withManualCommand,
} from './native-command-authority';
import { TurnStream } from '../../conversation/stream';
import { ProviderReplies } from './replies';
import { nativeProjectReadOnly } from './tool-validation';
import { routeProviderTool, type ProviderGrant } from './tool-bridge';
import type { ComputerRunnerDeps } from './ports';
import type { ComputerEvent } from './provider-state';
import { CodexMessageText } from './codex-message-text';
import { streamCodexTools } from './codex-tools';
import { streamNativeTools, streamDelta } from './runtime-tools';
import { messageOf } from '@smarteverything/logging';

export class NativeCommandOutput {
  private readonly replies: ProviderReplies;
  private readonly stream: TurnStream;
  private readonly grant: ProviderGrant;
  private readonly calls = new Set<string>();
  private readonly nativeText = new CodexMessageText();
  private closed = false;
  private readonly input: AiNativeCommandWrite;
  private readonly failed: (reason: string) => void;
  constructor(
    private readonly deps: ComputerRunnerDeps,
    private readonly chat: AiChatRow,
    operation: { readonly input: AiNativeCommandWrite; readonly failed: (reason: string) => void },
  ) {
    const { input } = operation;
    this.input = input;
    this.failed = operation.failed;
    if (chat.engine.kind !== 'claude' && chat.engine.kind !== 'codex')
      throw new ApiError('conflict', 'Command output requires a native provider chat.');
    const authority = commandAuthority(deps, chat, input.scope);
    manualCommandCaller(deps, chat, input);
    this.grant = authority.grant;
    const messageId = deps.store.assistantEvents.event(input.operation_id).message_id;
    if (messageId === null)
      throw new ApiError('conflict', 'The native command lost its real manual request message.');
    this.replies = new ProviderReplies(deps.conversation, chat, messageId, chat.engine.model);
    this.stream = new TurnStream(
      { chatId: chat.id, turnId: input.operation_id, messageId, profileId: chat.profile_id },
      deps.emit,
    );
    this.stream.bindTimeline((timeline): void => {
      this.replies.timeline(timeline);
    });
  }
  event(event: ComputerEvent): void {
    if (this.closed || event.job_id !== this.input.command_job_id) return;
    if (event.kind === 'text') this.text(event);
    if (event.kind === 'thinking') streamDelta(this.stream, event);
    if (event.kind === 'runtime') streamNativeTools(this.stream, event);
    if (event.kind === 'work_item') this.nativeItem(event);
    if (event.kind === 'tool_call') this.tool(event);
    if (event.kind === 'tool_result') this.toolResult(event);
    if (['prompt', 'dialog'].includes(event.kind)) this.stream.snapshot('tool', null, null);
  }
  private text(event: Extract<ComputerEvent, { kind: 'text' }>): void {
    if ('process_generation' in event) this.nativeText.observe(event);
    this.replies.text(event.delta);
    streamDelta(this.stream, event);
  }
  private nativeItem(event: Extract<ComputerEvent, { kind: 'work_item' }>): void {
    streamCodexTools(this.stream, event);
    const delta = this.nativeText.completed(event);
    this.replies.text(delta);
    this.stream.text(delta);
  }
  private toolResult(event: Extract<ComputerEvent, { kind: 'tool_result' }>): void {
    const item = this.stream.current().tools.find((tool) => tool.callId === event.call_id);
    if (item !== undefined)
      this.stream.tool(
        { ...item, state: event.failed ? 'failed' : 'done' },
        { output: event.text },
      );
  }
  settle(receipt: AiNativeCommandReceipt): void {
    if (this.closed || ['pending', 'running'].includes(receipt.status)) return;
    this.closed = true;
    const messageId = this.deps.store.assistantEvents.event(this.input.operation_id).message_id;
    this.deps.store.assistantEvents.mark(this.input.operation_id, 'answered_at');
    if (this.replies.fullText() === '' && receipt.text !== null) this.replies.text(receipt.text);
    if (receipt.status === 'settled' && !['error', 'interrupted'].includes(receipt.outcome ?? '')) {
      this.deps.conversation.stateOf(messageId, 'answered');
      this.replies.finish(this.stream.settled());
      this.stream.snapshot('idle', 'stop', null);
    } else {
      const reason = receipt.text ?? 'Native command completion is unconfirmed.';
      this.deps.conversation.failedMessage(messageId, reason, 'unknown');
      this.replies.fail(reason, this.stream.settled());
      this.stream.snapshot('failed', 'error', reason);
    }
  }
  private tool(event: Extract<ComputerEvent, { kind: 'tool_call' }>): void {
    if (this.calls.has(event.call_id)) return;
    this.calls.add(event.call_id);
    const item = {
      callId: event.call_id,
      name: event.name,
      title: event.name,
      state: 'running' as const,
      detail: null,
    };
    this.stream.tool(item, { input: event.input });
    if ('origin' in event && event.origin !== 'hub') return;
    void this.route(event)
      .then(({ line, failed, output }) => {
        if (this.closed) return;
        if (line !== '') this.deps.conversation.action(this.chat, line);
        this.stream.tool({ ...item, state: failed ? 'failed' : 'done' }, { output });
      })
      .catch((cause: unknown) => {
        if (this.closed) return;
        this.failed(messageOf(cause));
        this.deps.log.error('native_command.tool_bridge_failed', cause, { chatId: this.chat.id });
        this.stream.tool(
          { ...item, state: 'failed' },
          {
            output: messageOf(cause),
          },
        );
      });
  }
  private validateTool(write: boolean): void {
    if (this.closed)
      throw new ApiError('forbidden', 'This native command output is already closed.');
    const chat = this.deps.store.aiChats.chat(this.chat.id);
    manualCommandCaller(this.deps, chat, this.input);
    if (JSON.stringify(chat.engine) !== JSON.stringify(this.chat.engine))
      throw new ApiError('forbidden', 'The native command execution binding changed.');
    if (write && nativeProjectReadOnly(this.deps, chat))
      throw new ApiError('forbidden', 'The native permission allows reading project files only.');
  }
  private route(
    event: Extract<ComputerEvent, { kind: 'tool_call' }>,
  ): ReturnType<typeof routeProviderTool> {
    return Promise.resolve().then(() =>
      withManualCommand(
        this.deps,
        { chat: this.deps.store.aiChats.chat(this.chat.id), input: this.input },
        (caller) =>
          routeProviderTool(
            {
              directory: this.deps.directory,
              deviceId: this.input.scope.device_id,
              runtime: this.input.scope.runtime,
              grant: this.grant,
              caller,
              validate: (write): void => {
                this.validateTool(write);
              },
            },
            event,
          ),
      ),
    );
  }
}
