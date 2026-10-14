import { z } from 'zod';
import { COMPUTER_AI_READ, COMPUTER_AI_EXECUTE, COMPUTER_AI_REPLY } from './ai-requests';
import { CODEX_AI_READ, CODEX_AI_EXECUTE, CODEX_AI_REPLY } from './codex-requests';

export const COMPUTER_RUNTIME_READ = z.discriminatedUnion('runtime', [
  z.strictObject({ runtime: z.literal('claude'), request: COMPUTER_AI_READ }),
  z.strictObject({ runtime: z.literal('codex'), request: CODEX_AI_READ }),
]);
export type ComputerRuntimeRead = z.infer<typeof COMPUTER_RUNTIME_READ>;
export const COMPUTER_RUNTIME_EXECUTE = z.discriminatedUnion('runtime', [
  z.strictObject({ runtime: z.literal('claude'), request: COMPUTER_AI_EXECUTE }),
  z.strictObject({ runtime: z.literal('codex'), request: CODEX_AI_EXECUTE }),
]);
export type ComputerRuntimeExecute = z.infer<typeof COMPUTER_RUNTIME_EXECUTE>;
export const COMPUTER_RUNTIME_REQUEST = z.union([COMPUTER_RUNTIME_READ, COMPUTER_RUNTIME_EXECUTE]);
export type ComputerRuntimeRequest = z.infer<typeof COMPUTER_RUNTIME_REQUEST>;
export const COMPUTER_RUNTIME_REPLY = z.discriminatedUnion('runtime', [
  z.strictObject({ runtime: z.literal('claude'), reply: COMPUTER_AI_REPLY }),
  z.strictObject({ runtime: z.literal('codex'), reply: CODEX_AI_REPLY }),
]);
export type ComputerRuntimeReply = z.infer<typeof COMPUTER_RUNTIME_REPLY>;
