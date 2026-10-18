import { z } from 'zod';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { JSON_VALUE, type JsonValue, type ProviderTurn } from '@smarteverything/domain';
import type { ProviderCommandCatalogue } from './command-catalogue';
import { commandSource } from './command-input';
import { carriesToolResult, serializableMessage, type ProviderPayload } from './events';
import { managedContext } from './managed-project';
import type { ProviderSource } from './source';
import type { JobTasks } from './task-output';

export interface RuntimeCapture {
  readonly turn: ProviderTurn;
  readonly cwd: string;
  readonly tasks: JobTasks;
  readonly source: ProviderSource;
  readonly commands: ProviderCommandCatalogue;
  readonly initialize: (
    message: Extract<SDKMessage, { type: 'system'; subtype: 'init' }>,
    record: Record<string, JsonValue>,
  ) => void;
}

export function runtimeEvent(capture: RuntimeCapture, message: SDKMessage): ProviderPayload | null {
  if (message.type === 'auth_status' || !carriesToolResult(message)) return null;
  const payload = serializableMessage(message);
  capture.tasks.capture(message, payload);
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = z.record(z.string(), JSON_VALUE).parse(payload);
  if (message.type === 'system' && message.subtype === 'init') capture.initialize(message, record);
  return {
    kind: 'runtime',
    type: message.type,
    payload: capture.source.record(
      commandSource({ ...record, ...managedContext(capture.turn) }, capture.turn, capture.commands),
      capture.cwd,
    ),
  };
}
