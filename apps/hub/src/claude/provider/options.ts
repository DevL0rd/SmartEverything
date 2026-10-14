import { env } from 'node:process';
import { mkdir, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { Options, ModelInfo } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeProviderOptions, ProviderTurn } from '@smarteverything/domain';
import { z } from 'zod';
import { ProviderInputError } from './input';

export const SDK_VERSION = '0.3.296';
const EFFORT = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);
const EXCLUDED_AUTH_ENVIRONMENT = new Set([
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_USE_ANTHROPIC_AWS',
  'CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD',
  'CLAUDE_CODE_USE_MANTLE',
]);
const LOCAL_ENVIRONMENT = z.record(z.string(), z.string().optional());

export function subscriptionEnvironment(): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(LOCAL_ENVIRONMENT.parse({ ...env })).filter(
      ([key]) => !EXCLUDED_AUTH_ENVIRONMENT.has(key),
    ),
  );
}

export async function workDirectory(
  dataDirectory: string,
  options: ClaudeProviderOptions,
): Promise<string> {
  const cwd = options.cwd;
  if (cwd !== undefined) {
    if (!isAbsolute(cwd) || !(await stat(cwd)).isDirectory()) {
      throw new ProviderInputError(
        'The provider working directory must be an existing absolute directory on this computer.',
      );
    }
    return cwd;
  }
  const directory = join(dataDirectory, 'provider-work');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}

export function modelOptions(
  turn: ProviderTurn,
  model: ModelInfo,
): Pick<Options, 'effort' | 'thinking'> {
  const settings = turn.options;
  const effort = turn.effort === null ? undefined : EFFORT.parse(turn.effort);
  if (effort !== undefined && model.supportedEffortLevels?.includes(effort) !== true) {
    throw new ProviderInputError(
      `This computer's ${model.value} does not advertise effort ${effort}.`,
    );
  }
  if (settings.thinking === 'adaptive' && model.supportsAdaptiveThinking !== true) {
    throw new ProviderInputError(
      `This computer's ${model.value} does not advertise adaptive thinking.`,
    );
  }
  validateFast(settings, model);
  const thinking = thinkingOf(settings);
  return {
    ...(effort === undefined ? {} : { effort }),
    ...(thinking === undefined ? {} : { thinking }),
  };
}

function thinkingOf(settings: ClaudeProviderOptions): Options['thinking'] {
  if (settings.thinking === undefined) {
    return undefined;
  }
  if (settings.thinking === 'enabled') {
    return {
      type: 'enabled',
      ...(settings.thinking_budget === undefined ? {} : { budgetTokens: settings.thinking_budget }),
    };
  }
  return { type: settings.thinking };
}

function validateFast(settings: ClaudeProviderOptions, model: ModelInfo): void {
  if (settings.fast === true && model.supportsFastMode !== true) {
    throw new ProviderInputError(`This computer's ${model.value} does not advertise fast mode.`);
  }
}
