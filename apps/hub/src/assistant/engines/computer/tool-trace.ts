import { Logger } from '@smarteverything/logging';
import type { HubToolResult, ToolCaller } from '../../../ai-tools/hub-tool';

const log = new Logger('hub.assistant-tools');

interface ToolCallEvent {
  readonly name: string;
  readonly call_id: string;
  readonly job_id: string;
}

export class ProviderToolTrace {
  private readonly startedAt = performance.now();
  private readonly fields: Record<string, unknown>;

  constructor(event: ToolCallEvent, caller: ToolCaller, runtime: string, deviceId: string) {
    this.fields = {
      tool: event.name,
      callId: event.call_id,
      jobId: event.job_id,
      runtime,
      deviceId,
      chatId: caller.chatId,
      profileId: caller.profileId,
    };
  }

  answered(result: HubToolResult, delivered: boolean, chars: number, truncated: boolean): void {
    log.debug('provider_tool.answered', () => ({
      ...this.fields,
      delivered,
      truncated,
      chars,
      failed: 'error' in result.response || truncated,
      pictures: result.pictures.length,
      durationMs: Math.round(performance.now() - this.startedAt),
    }));
  }
}

export function outsideGrant(event: ToolCallEvent, caller: ToolCaller, granted: number): void {
  log.warn('provider_tool.outside_grant', {
    tool: event.name,
    callId: event.call_id,
    chatId: caller.chatId,
    granted,
  });
}

export function invalidArguments(event: ToolCallEvent, caller: ToolCaller, reason: string): void {
  log.warn('provider_tool.invalid', {
    tool: event.name,
    callId: event.call_id,
    chatId: caller.chatId,
    reason: reason.slice(0, 300),
  });
}

export function nativeTool(chatId: string, event: { name: string; call_id: string }): void {
  log.debug('provider_tool.native', { tool: event.name, callId: event.call_id, chatId });
}

export function duplicateTool(chatId: string, event: { name: string; call_id: string }): void {
  log.debug('provider_tool.duplicate', { tool: event.name, callId: event.call_id, chatId });
}

export function staleTool(chatId: string, event: { name: string; call_id: string }): void {
  log.debug('provider_tool.stale', { tool: event.name, callId: event.call_id, chatId });
}
