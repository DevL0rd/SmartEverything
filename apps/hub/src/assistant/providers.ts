import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  AssistantModelInfo,
  AssistantModels,
  AssistantUsage,
  ResponderMode,
} from '@smarteverything/domain';
import { z } from 'zod';
import { codexHome } from './environment';
import { isUnreadableJson } from './errors';
import { claudeExecutable } from './executables';

const CACHED_MODEL = z.looseObject({
  slug: z.string(),
  display_name: z.string().optional(),
  visibility: z.string().optional(),
  supported_reasoning_levels: z.array(z.looseObject({ effort: z.string() })).default([]),
});

const CODEX_CACHE = z.looseObject({ fetched_at: z.string(), models: z.array(CACHED_MODEL) });

const CLAUDE_MODEL = z.looseObject({
  value: z.string(),
  displayName: z.string(),
  description: z.string(),
  supportedEffortLevels: z.array(z.string()).optional(),
});

type ClaudeModel = z.infer<typeof CLAUDE_MODEL>;

const NEVER: AsyncIterable<never> = {
  [Symbol.asyncIterator]: () => ({
    next: () => new Promise<IteratorResult<never>>(() => undefined),
  }),
};

function unavailable(mode: ResponderMode, source: string, note: string): AssistantModels {
  return {
    mode,
    source,
    note,
    observed_at: new Date().toISOString(),
    default_model: { id: '', name: 'Default', efforts: [] },
    models: [],
    live_switch: false,
  };
}

function claudeModel(row: ClaudeModel): AssistantModelInfo {
  return { id: row.value, name: row.displayName, efforts: row.supportedEffortLevels ?? [] };
}

function presetName(preset: ClaudeModel | undefined): string {
  if (preset === undefined) {
    return 'Default';
  }
  const [current, rest] = preset.description.split(' · ');
  return current === undefined || rest === undefined ? preset.displayName : `Default (${current})`;
}

export function distinctModels(rows: readonly ClaudeModel[]): AssistantModelInfo[] {
  const seen = new Set<string>();
  return rows.map(claudeModel).filter((model) => {
    const fresh = !seen.has(model.id) && !seen.has(model.name);
    seen.add(model.id);
    seen.add(model.name);
    return fresh;
  });
}

async function claudeRows(): Promise<ClaudeModel[]> {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const session = query({
    prompt: NEVER,
    options: { cwd: homedir(), pathToClaudeCodeExecutable: await claudeExecutable() },
  });
  try {
    return z.array(CLAUDE_MODEL).parse(await session.supportedModels());
  } finally {
    session.close();
  }
}

export async function claudeModels(liveSwitch: boolean): Promise<AssistantModels> {
  try {
    const rows = await claudeRows();
    const preset = rows.find((row) => row.value === 'default');
    const fallbackName = presetName(preset);
    return {
      mode: 'claude-session',
      source: 'Model list from your installed Claude Code',
      note: 'Read from Claude Code each time, so it always matches what your account offers.',
      observed_at: new Date().toISOString(),
      models: distinctModels(rows.filter((row) => row !== preset)),
      default_model:
        preset === undefined
          ? { id: '', name: fallbackName, efforts: [] }
          : { ...claudeModel(preset), id: '', name: fallbackName },
      live_switch: liveSwitch,
    };
  } catch (cause) {
    return unavailable(
      'claude-session',
      'Claude Code unavailable',
      cause instanceof Error ? cause.message : 'Claude Code could not list its models',
    );
  }
}

export async function codexModels(): Promise<AssistantModels> {
  const path = join(codexHome(), 'models_cache.json');
  try {
    const cache = CODEX_CACHE.parse(JSON.parse(await readFile(path, 'utf8')));
    return {
      mode: 'codex-local',
      source: 'Codex model list from your Codex account',
      note: 'Codex refreshes this list whenever it runs.',
      observed_at: new Date(cache.fetched_at).toISOString(),
      models: cache.models
        .filter((model) => model.visibility !== 'hide')
        .map((model) => ({
          id: model.slug,
          name: model.display_name ?? model.slug,
          efforts: model.supported_reasoning_levels.map((level) => level.effort),
        })),
      default_model: { id: '', name: 'Codex default', efforts: [] },
      live_switch: true,
    };
  } catch (cause) {
    if (!isUnreadableJson(cause) && !(cause instanceof z.ZodError)) {
      throw cause;
    }
    return unavailable(
      'codex-local',
      'Codex model list unavailable',
      'Sign in to Codex and run it once to load its models.',
    );
  }
}

export async function responderModels(
  mode: ResponderMode,
  liveSwitch: boolean,
): Promise<AssistantModels> {
  switch (mode) {
    case 'claude-session':
      return claudeModels(liveSwitch);
    case 'codex-local':
      return codexModels();
    case 'none':
      return unavailable(mode, 'No model list', 'This AI backend does not report models.');
  }
}

const CLAUDE_WINDOWS: Readonly<Record<string, string>> = {
  five_hour: '5-hour limit',
  seven_day: 'Weekly limit',
  seven_day_opus: 'Weekly Opus limit',
  seven_day_sonnet: 'Weekly Sonnet limit',
};

const WINDOW = z.looseObject({
  utilization: z.number().nullable().optional(),
  resets_at: z.string().nullable().optional(),
});

const USAGE_REPORT = z.looseObject({
  rate_limits_available: z.boolean().nullable().optional(),
  rate_limits: z.record(z.string(), z.unknown()).nullable().optional(),
});

type UsageWindow = AssistantUsage['windows'][number];

type WindowRead = { readonly window: UsageWindow } | { readonly missing: string } | null;

async function claudeReport(): Promise<unknown> {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const session = query({
    prompt: NEVER,
    options: { cwd: homedir(), pathToClaudeCodeExecutable: await claudeExecutable() },
  });
  try {
    return await session.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
      skipBehaviors: true,
    });
  } finally {
    session.close();
  }
}

function resetsOf(text: string | null | undefined): string | null {
  if (text === null || text === undefined) {
    return null;
  }
  const at = new Date(text);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

function readWindow(label: string, raw: unknown): WindowRead {
  if (raw === null || raw === undefined) {
    return null;
  }
  const parsed = WINDOW.safeParse(raw);
  if (!parsed.success) {
    return { missing: label };
  }
  const { utilization } = parsed.data;
  if (utilization === null || utilization === undefined) {
    return null;
  }
  const used = Math.min(1000, Math.max(0, Math.round(utilization)));
  return { window: { label, used_percent: used, resets_at: resetsOf(parsed.data.resets_at) } };
}

function usageOf(mode: ResponderMode, raw: unknown): AssistantUsage {
  const report = USAGE_REPORT.safeParse(raw);
  const limits = report.success ? report.data.rate_limits : null;
  if (
    !report.success ||
    report.data.rate_limits_available !== true ||
    limits === null ||
    limits === undefined
  ) {
    return { mode, windows: [], note: 'Claude plan limits are not available for this sign-in.' };
  }
  const reads = Object.entries(CLAUDE_WINDOWS).map(([key, label]) =>
    readWindow(label, limits[key]),
  );
  const windows = reads.flatMap((read) => (read !== null && 'window' in read ? [read.window] : []));
  const missing = reads.flatMap((read) =>
    read !== null && 'missing' in read ? [read.missing] : [],
  );
  return {
    mode,
    windows,
    note:
      missing.length === 0
        ? null
        : `Unavailable: ${missing.join(', ')} (Claude reported an unexpected shape).`,
  };
}

export async function responderUsage(mode: ResponderMode): Promise<AssistantUsage> {
  if (mode !== 'claude-session') {
    return { mode, windows: [], note: 'Plan usage is shown for Claude Code.' };
  }
  let raw: unknown;
  try {
    raw = await claudeReport();
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { mode, windows: [], note: `Plan usage is unavailable: ${reason.slice(0, 300)}` };
  }
  return usageOf(mode, raw);
}
