import type { Options, SettingSource } from '@anthropic-ai/claude-agent-sdk';
import {
  CLAUDE_DEFAULT_SETTING_SOURCES,
  type ProviderTurn,
  type ClaudeProviderOptions,
} from '@smarteverything/domain';
import { agentDefinitions } from './agents';
import { managedConfiguration } from './managed-project';
import { initialSettings } from './settings';

export function effectiveSettingSources(options: ClaudeProviderOptions): readonly SettingSource[] {
  return options.setting_sources ?? CLAUDE_DEFAULT_SETTING_SOURCES;
}
function thinkingOptions(options: ClaudeProviderOptions): Options['thinking'] {
  if (options.thinking === undefined) return undefined;
  if (options.thinking === 'disabled') return { type: 'disabled' };
  if (options.thinking === 'adaptive')
    return {
      type: 'adaptive',
      ...(options.thinking_display === undefined ? {} : { display: options.thinking_display }),
    };
  return {
    type: 'enabled',
    ...(options.thinking_budget === undefined ? {} : { budgetTokens: options.thinking_budget }),
    ...(options.thinking_display === undefined ? {} : { display: options.thinking_display }),
  };
}
function interactionOptions(options: ClaudeProviderOptions): Options {
  return {
    ...(options.agent === undefined ? {} : { agent: options.agent }),
    ...(options.resume_session_at === undefined
      ? {}
      : { resumeSessionAt: options.resume_session_at }),
    ...(options.persist_session === undefined ? {} : { persistSession: options.persist_session }),
    ...(options.prompt_suggestions === undefined
      ? {}
      : { promptSuggestions: options.prompt_suggestions }),
    ...(options.agent_progress_summaries === undefined
      ? {}
      : { agentProgressSummaries: options.agent_progress_summaries }),
    ...(options.max_budget_usd === undefined ? {} : { maxBudgetUsd: options.max_budget_usd }),
    ...(options.permission_prompts === undefined
      ? {}
      : { permissionPrompts: options.permission_prompts }),
  };
}
function sessionOptions(options: ClaudeProviderOptions): Options {
  return {
    ...interactionOptions(options),
    ...(options.output_format === undefined ? {} : { outputFormat: options.output_format }),
    ...(options.max_turns === undefined ? {} : { maxTurns: options.max_turns }),
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.fork_session === undefined ? {} : { forkSession: options.fork_session }),
  };
}
export function configurationOptions(options: ClaudeProviderOptions): Options {
  const thinking = thinkingOptions(options);
  const agents = agentDefinitions(options);
  return {
    permissionMode: options.permission_mode ?? 'default',
    allowDangerouslySkipPermissions: options.permission_mode === 'bypassPermissions',
    settingSources: [...effectiveSettingSources(options)],
    settings: { fastMode: options.fast ?? false, ...initialSettings(options.flag_settings ?? {}) },
    ...sessionOptions(options),
    ...(thinking === undefined ? {} : { thinking }),
    ...(agents === undefined ? {} : { agents }),
    ...(options.additional_directories === undefined
      ? {}
      : { additionalDirectories: options.additional_directories }),
    ...(options.plugins === undefined ? {} : { plugins: options.plugins }),
  };
}

export function configuredOptions(turn: ProviderTurn): Options {
  return {
    ...configurationOptions(managedConfiguration(turn)),
    systemPrompt: { type: 'preset', preset: 'claude_code', append: turn.system },
  };
}
