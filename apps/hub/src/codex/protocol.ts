import { z } from 'zod';
import { JSON_VALUE, CODEX_RPC_ID } from '@smarteverything/domain';
export const RPC_RECORD = z.record(z.string(), JSON_VALUE);
export type RpcRecord = z.infer<typeof RPC_RECORD>;
export type RpcId = z.infer<typeof CODEX_RPC_ID>;
export const RPC_MESSAGE = z.union([
  z.strictObject({ id: CODEX_RPC_ID, method: z.string().min(1), params: RPC_RECORD.optional() }),
  z.strictObject({
    method: z.string().min(1),
    params: RPC_RECORD.optional(),
    emittedAtMs: z.int().optional(),
  }),
  z.strictObject({ id: CODEX_RPC_ID, result: JSON_VALUE }),
  z.strictObject({
    id: CODEX_RPC_ID,
    error: z.strictObject({ code: z.int(), message: z.string(), data: JSON_VALUE.optional() }),
  }),
]);
export type RpcMessage = z.infer<typeof RPC_MESSAGE>;
export const RPC_METHOD = z.enum([
  'initialize',
  'account/read',
  'account/rateLimits/read',
  'config/read',
  'model/list',
  'skills/list',
  'thread/compact/start',
  'thread/start',
  'thread/resume',
  'thread/read',
  'thread/list',
  'thread/items/list',
  'turn/start',
  'turn/steer',
  'turn/interrupt',
  'thread/name/set',
  'thread/fork',
  'thread/archive',
  'thread/unarchive',
  'thread/delete',
  'thread/unsubscribe',
  'mcpServerStatus/list',
]);
export type RpcMethod = z.infer<typeof RPC_METHOD>;
export const INITIALIZED = z.object({
  userAgent: z.string().min(1),
  codexHome: z.string().min(1),
  platformFamily: z.string(),
  platformOs: z.string(),
});
export const THREAD = z.object({
  id: z.string().min(1).max(200),
  name: z.string().nullable(),
  preview: z.string(),
  cwd: z.string().min(1),
  model: z.string().nullable(),
  canAcceptDirectInput: z.boolean().nullable().optional(),
  modelProvider: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  status: z.object({
    type: z.enum(['notLoaded', 'idle', 'systemError', 'active']),
    activeFlags: z.array(z.string()).optional(),
  }),
});
export const THREAD_REPLY = z.object({
  thread: THREAD,
  modelProvider: z.string().optional(),
  cwd: z.string().optional(),
  runtimeWorkspaceRoots: z.array(z.string()).optional(),
});
export const TURN = z.object({
  id: z.string().min(1),
  status: z.enum(['inProgress', 'completed', 'failed', 'interrupted']),
  error: z.object({ message: z.string() }).nullable(),
});
export const TURN_REPLY = z.object({ turn: TURN });
export const MODEL = z.object({
  id: z.string().min(1),
  model: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string(),
  supportedReasoningEfforts: z.array(
    z.object({ reasoningEffort: z.string().min(1), description: z.string() }),
  ),
  inputModalities: z.array(z.enum(['text', 'image', 'audio'])),
  serviceTiers: z.array(z.object({ id: z.string().min(1) })),
});
export const MODEL_PAGE = z.object({
  data: z.array(MODEL).max(500),
  nextCursor: z.string().nullable(),
});
export const ACCOUNT = z.object({
  account: z.object({ type: z.string() }).nullable(),
  requiresOpenaiAuth: z.boolean(),
});
export function rpcIdentity(id: RpcId): string {
  return JSON.stringify([typeof id, id]);
}
