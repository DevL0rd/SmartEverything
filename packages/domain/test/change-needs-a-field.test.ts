import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { AI_BUDGET_CHANGE, AI_BUDGET_SETTINGS } from '../src/ai-budget';
import { AI_CHAT_CHANGE } from '../src/ai-chats';
import { API_ENDPOINTS } from '../src/api/endpoints';
import { PLUGIN_CHANGE } from '../src/api/endpoints-plugins';
import { CLAUDE_CLI_START } from '../src/claude-cli';
import { CODEX_AI_SETTINGS_PATCH } from '../src/codex';
import { COMPUTER_AI_SETTINGS_PATCH } from '../src/computer-ai';
import { FITNESS_SETTINGS_CHANGE } from '../src/fitness-settings';
import { COMPUTER_SCOPES_PATCH } from '../src/node/computer-scopes';
import { PROFILE_CHANGE } from '../src/profiles';
import { REACH_SETTINGS_CHANGE } from '../src/reach';
import { TRANSCRIPT_SETTINGS_CHANGE } from '../src/transcripts';

interface Case {
  readonly name: string;
  readonly schema: z.ZodType;
  readonly empty: unknown;
  readonly change: unknown;
}

const CASES: readonly Case[] = [
  { name: 'AI budget', schema: AI_BUDGET_CHANGE, empty: {}, change: { hard_stop: true } },
  { name: 'AI chat', schema: AI_CHAT_CHANGE, empty: {}, change: { title: 'Renamed' } },
  { name: 'plugin', schema: PLUGIN_CHANGE, empty: {}, change: { enabled: true } },
  { name: 'plugin trust', schema: PLUGIN_CHANGE, empty: {}, change: { trusted: false } },
  {
    name: 'plugin tools',
    schema: PLUGIN_CHANGE,
    empty: {},
    change: { tool_switches: { a: true } },
  },
  { name: 'plugin settings', schema: PLUGIN_CHANGE, empty: {}, change: { settings: { a: 1 } } },
  {
    name: 'Codex settings',
    schema: CODEX_AI_SETTINGS_PATCH,
    empty: {},
    change: { control: { enabled: true } },
  },
  {
    name: 'computer AI settings',
    schema: COMPUTER_AI_SETTINGS_PATCH,
    empty: {},
    change: { provider: { enabled: true } },
  },
  {
    name: 'fitness settings',
    schema: FITNESS_SETTINGS_CHANGE,
    empty: {},
    change: { maxHeartRate: null },
  },
  {
    name: 'computer permissions',
    schema: COMPUTER_SCOPES_PATCH,
    empty: {},
    change: { files: false },
  },
  { name: 'profile', schema: PROFILE_CHANGE, empty: {}, change: { name: 'Sam' } },
  { name: 'reach quiet hours', schema: REACH_SETTINGS_CHANGE, empty: {}, change: { quiet: null } },
  { name: 'reach cameras', schema: REACH_SETTINGS_CHANGE, empty: {}, change: { cameras: [] } },
  { name: 'reach wake', schema: REACH_SETTINGS_CHANGE, empty: {}, change: { wakeOff: [] } },
  {
    name: 'transcript settings',
    schema: TRANSCRIPT_SETTINGS_CHANGE,
    empty: {},
    change: { retention_days: 30 },
  },
  {
    name: 'schedule label',
    schema: API_ENDPOINTS.updateSchedule.body,
    empty: {},
    change: { label: null },
  },
];

describe('a change names something to change', () => {
  it.each(CASES)('refuses an empty $name change', ({ schema, empty }) => {
    expect(schema.safeParse(empty).success).toBe(false);
  });

  it.each(CASES)('accepts a $name change that names a field', ({ schema, change }) => {
    expect(schema.safeParse(change).success).toBe(true);
  });

  it('refuses a transcript change whose fields are all undefined', () => {
    expect(TRANSCRIPT_SETTINGS_CHANGE.safeParse({ retention_days: undefined }).success).toBe(false);
  });
});

describe('starting a Claude session', () => {
  const START = {
    operation_id: '3a000000-0000-4000-8000-0000000000a1',
    model: 'claude-sonnet',
    settings: { cwd: '/work', builtin_tools: [] },
  };

  it('needs a first message or an earlier session to continue', () => {
    expect(CLAUDE_CLI_START.safeParse(START).success).toBe(false);
    expect(CLAUDE_CLI_START.safeParse({ ...START, message: { text: 'hello' } }).success).toBe(true);
    expect(
      CLAUDE_CLI_START.safeParse({ ...START, continue_from: { session_id: 's1' } }).success,
    ).toBe(true);
  });
});

describe('a change leaves what it does not name alone', () => {
  it('changes one budget field without filling in the others', () => {
    expect(AI_BUDGET_CHANGE.parse({ hard_stop: true })).toStrictEqual({ hard_stop: true });
    expect(AI_BUDGET_CHANGE.parse({ daily_usd: 5 })).toStrictEqual({ daily_usd: 5 });
  });

  it('changes one computer control field without resetting the allowed areas', () => {
    expect(COMPUTER_AI_SETTINGS_PATCH.parse({ control: { enabled: true } })).toStrictEqual({
      control: { enabled: true },
    });
  });

  it('changes one Codex field without resetting the rest of its group', () => {
    expect(CODEX_AI_SETTINGS_PATCH.parse({ control: { mcp_areas: ['home'] } })).toStrictEqual({
      control: { mcp_areas: ['home'] },
    });
    expect(CODEX_AI_SETTINGS_PATCH.parse({ provider: { options: {} } })).toStrictEqual({
      provider: { options: {} },
    });
  });

  it('still fills the defaults when whole settings are read', () => {
    expect(AI_BUDGET_SETTINGS.parse({})).toStrictEqual({
      daily_usd: null,
      monthly_usd: null,
      warn_at_percent: 80,
      burn: null,
      low_credits_usd: null,
      hard_stop: false,
    });
  });
});
