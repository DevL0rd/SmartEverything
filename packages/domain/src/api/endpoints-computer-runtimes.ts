import { z } from 'zod';
import { AI_NATIVE_COMMAND_PRIVATE_OPERATION } from '../ai-native-commands';
import {
  COMPUTER_AI_RUNTIME,
  COMPUTER_RUNTIME_STATUS,
  COMPUTER_RUNTIME_SETTINGS_PATCH,
  COMPUTER_RUNTIME_MODEL,
} from '../computer-ai-runtime';
import {
  COMPUTER_RUNTIME_READ,
  COMPUTER_RUNTIME_EXECUTE,
  COMPUTER_RUNTIME_REPLY,
} from '../node/runtime-requests';
import { CODEX_OPERATION } from '../codex';
import { CLAUDE_OPERATION } from '../claude';
import { endpoint, NO_BODY } from './endpoint';
import { NOTHING } from './primitives';

const TARGET = z.strictObject({ deviceId: z.uuid(), runtime: COMPUTER_AI_RUNTIME });
const PUBLIC_READ = COMPUTER_RUNTIME_READ.refine(
  (envelope) => !AI_NATIVE_COMMAND_PRIVATE_OPERATION.safeParse(envelope.request.operation).success,
  'Native commands require their dedicated caller-bound endpoint.',
);
const NATIVE_EXECUTE = COMPUTER_RUNTIME_EXECUTE.refine(
  (envelope) => !AI_NATIVE_COMMAND_PRIVATE_OPERATION.safeParse(envelope.request.operation).success,
  'Native commands require their dedicated caller-bound endpoint.',
).refine(
  (envelope) => 'operation_id' in envelope.request && envelope.request.operation_id !== undefined,
  'Native mutation requires an operation_id.',
);
export const COMPUTER_RUNTIME_RECEIPT = z.discriminatedUnion('runtime', [
  z.strictObject({ runtime: z.literal('claude'), operation: CLAUDE_OPERATION }),
  z.strictObject({ runtime: z.literal('codex'), operation: CODEX_OPERATION }),
]);
export const COMPUTER_RUNTIME_ENDPOINTS = {
  readComputerRuntime: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/ai/:runtime',
    access: 'owner',
    summary: 'Read settings and advertised capabilities of one computer runtime',
    params: TARGET,
    query: NOTHING,
    body: NO_BODY,
    response: COMPUTER_RUNTIME_STATUS,
  }),
  updateComputerRuntime: endpoint({
    method: 'PATCH',
    path: '/api/computers/:deviceId/ai/:runtime',
    access: 'owner',
    summary: 'Configure one selected computer runtime',
    params: TARGET,
    query: NOTHING,
    body: COMPUTER_RUNTIME_SETTINGS_PATCH,
    response: COMPUTER_RUNTIME_STATUS,
  }),
  readComputerRuntimeModels: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/ai/:runtime/models',
    access: 'owner',
    summary: 'Discover available models on one computer runtime',
    params: TARGET,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(COMPUTER_RUNTIME_MODEL).max(500),
  }),
  readComputerRuntimeState: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/ai/:runtime/read',
    access: 'owner',
    summary: 'Read typed native state on the exact computer runtime',
    params: TARGET,
    query: NOTHING,
    body: PUBLIC_READ,
    response: COMPUTER_RUNTIME_REPLY,
  }),
  executeComputerRuntime: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/ai/:runtime/control',
    access: 'owner',
    summary: 'Apply a correlated native mutation on the exact computer runtime',
    params: TARGET,
    query: NOTHING,
    body: NATIVE_EXECUTE,
    response: COMPUTER_RUNTIME_REPLY,
  }),
  readComputerRuntimeReceipt: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/ai/:runtime/operations/:operationId',
    access: 'owner',
    summary: 'Read the owner-bound receipt without resubmitting its mutation',
    params: TARGET.extend({ operationId: z.uuid() }),
    query: NOTHING,
    body: NO_BODY,
    response: COMPUTER_RUNTIME_RECEIPT,
  }),
} as const;
