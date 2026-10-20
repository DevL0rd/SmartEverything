import { z } from 'zod';
import { isAbsolute } from 'node:path';
import { HARNESS_AUTHORITY } from './server-policy';
import {
  HARNESS_PLATFORM,
  AI_HARNESS_TARGET,
  AI_HARNESS_PERMISSION,
  AI_HARNESS_STORAGE_BINDING,
} from '@smarteverything/domain';
import type { AgentOptions } from '@deepseek-ai/dsh-agent';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';

export const HARNESS_HOST = z.strictObject({
  target: AI_HARNESS_TARGET,
  name: z.string().min(1).max(200),
  platform: HARNESS_PLATFORM,
  homeDirectory: z.string().min(1).refine(isAbsolute, 'Host home directory must be absolute.'),
  stateDirectory: z.string().min(1).refine(isAbsolute, 'Host state directory must be absolute.'),
});
export type HarnessHost = z.infer<typeof HARNESS_HOST>;

export const HARNESS_SESSION_OPTIONS = z.strictObject({
  sessionId: z.string().min(1).max(200),
  provider: z.string().min(1).max(200),
  model: z.string().min(1).max(200),
  effort: z.string().min(1).max(32).optional(),
  directory: z.string().min(1).optional(),
  storageBinding: AI_HARNESS_STORAGE_BINDING.optional(),
  permission: AI_HARNESS_PERMISSION.optional(),
  authority: HARNESS_AUTHORITY.optional(),
  pluginAgentPolicy: z
    .strictObject({
      persona: z.string().min(1).max(100_000),
      tools: z.array(z.string().min(1).max(200)).max(2000).optional(),
    })
    .optional(),
});
export type HarnessSessionOptions = z.infer<typeof HARNESS_SESSION_OPTIONS>;

export function agentOptions(options: HarnessSessionOptions): AgentOptions {
  return {
    provider: options.provider,
    model: options.model,
    ...(options.effort === undefined ? {} : { reasoningEffort: ReasoningEffortId(options.effort) }),
  };
}
