import { z } from 'zod';

const COUNT = z.int().nonnegative();
const MILLISECONDS = z.number().nonnegative();

export const AI_SESSION_STATS = z.strictObject({
  turns: COUNT,
  steps: COUNT,
  llm_ms: MILLISECONDS,
  tool_ms: MILLISECONDS,
  ttft_ms: MILLISECONDS,
  ttft_steps: COUNT,
  decode_ms: MILLISECONDS,
  decode_tokens: MILLISECONDS,
});
export type AiSessionStats = z.infer<typeof AI_SESSION_STATS>;

export const AI_SESSION_TURN = z.strictObject({
  turn: COUNT,
  seq: COUNT,
  prompt: z.string(),
  response: z.string(),
});
export type AiSessionTurn = z.infer<typeof AI_SESSION_TURN>;

export const AI_SESSION_INFO = z.strictObject({
  stats: AI_SESSION_STATS,
  turns: z.array(AI_SESSION_TURN),
});
export type AiSessionInfo = z.infer<typeof AI_SESSION_INFO>;
