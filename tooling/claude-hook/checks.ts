import { extname } from 'node:path';
import { z } from 'zod';
import { parseJson } from './input.ts';
import { rawFailure, skippedNotice, timedOut, type Section } from './output.ts';
import { ESLINT_MS, nonEmptyLines, runTool, SMALL_TOOL_MS } from './process.ts';

const LINT_EXT = new Set(['.ts', '.tsx', '.cts', '.mts', '.js', '.mjs', '.cjs']);
const SPELL_EXT = new Set(['.ts', '.tsx', '.md', '.json', '.yaml', '.yml']);

const eslintReport = z.array(
  z.object({
    messages: z.array(
      z.object({
        line: z.number().optional(),
        column: z.number().optional(),
        ruleId: z.string().nullable(),
        message: z.string(),
      }),
    ),
  }),
);

export async function lint(rel: string): Promise<Section | null> {
  if (!LINT_EXT.has(extname(rel))) return null;
  const args = ['--max-warnings=0', '--no-warn-ignored', '--cache'];
  const output = ['--cache-location', '.cache/eslint/', '--format', 'json', rel];
  const result = await runTool('eslint', [...args, ...output], ESLINT_MS);
  if (skippedNotice('eslint', result)) return null;
  if (result.code === 0) return null;
  if (result.timedOut) return timedOut('eslint', ESLINT_MS);
  const parsed = parseJson(result.stdout);
  const report = parsed.ok ? eslintReport.safeParse(parsed.value) : null;
  if (report?.success !== true) return rawFailure('eslint', result);
  const lines = report.data.flatMap((file) =>
    file.messages.map((entry) => {
      const where = [entry.line, entry.column].filter((part) => part !== undefined).join(':');
      const rule = entry.ruleId ?? 'fatal';
      return where === '' ? `${entry.message} (${rule})` : `${where} ${entry.message} (${rule})`;
    }),
  );
  return { check: 'eslint', lines };
}

export async function format(rel: string): Promise<Section | null> {
  const args = ['--check', '--ignore-unknown', '--log-level', 'warn', rel];
  const result = await runTool('prettier', args, SMALL_TOOL_MS);
  if (result.code === 0) return null;
  if (result.timedOut) return timedOut('prettier', SMALL_TOOL_MS);
  const errors = nonEmptyLines(result.stderr).filter((line) => line.startsWith('[error]'));
  const quoted = `'${rel.replaceAll("'", `'\\''`)}'`;
  const fix = `not formatted, run: pnpm exec prettier --write ${quoted}`;
  return { check: 'prettier', lines: errors.length > 0 ? errors : [fix] };
}

export async function spell(rel: string): Promise<Section | null> {
  if (!SPELL_EXT.has(extname(rel))) return null;
  const args = ['--no-progress', '--no-summary', '--no-must-find-files', '--cache'];
  const cache = ['--cache-location', '.cache/cspell/', rel];
  const result = await runTool('cspell', [...args, ...cache], SMALL_TOOL_MS);
  if (result.code === 0) return null;
  if (result.timedOut) return timedOut('cspell', SMALL_TOOL_MS);
  const lines = nonEmptyLines(result.stdout).map((line) => line.replace(`${rel}:`, ''));
  return lines.length > 0 ? { check: 'cspell', lines } : rawFailure('cspell', result);
}
