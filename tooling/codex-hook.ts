import { text } from 'node:stream/consumers';
import { resolve } from 'node:path';
import { z } from 'zod';
import { onBashDone, onEdit, onSnapshot } from './claude-hook/handlers.ts';
import { agentInput, HookError, parseInput, readStdin } from './claude-hook/input.ts';

const patchInput = agentInput.extend({
  cwd: z.string().min(1),
  tool_name: z.literal('apply_patch'),
  tool_input: z.object({ command: z.string() }),
});

function affectedFiles(command: string): readonly string[] {
  const marker = /^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/gm;
  const files = [...command.matchAll(marker)].map((match) => match[1]?.trimEnd());
  return parseInput('patch paths', z.array(z.string().min(1)).nonempty(), [...new Set(files)]);
}

async function checkPatch(mode: 'snapshot' | 'edit', raw: unknown): Promise<number> {
  const input = parseInput('patch', patchInput, raw);
  let code = 0;
  for (const file of affectedFiles(input.tool_input.command)) {
    const adapted = {
      ...input,
      tool_name: 'Edit',
      tool_input: { file_path: resolve(input.cwd, file) },
    };
    const result = mode === 'snapshot' ? await onSnapshot(adapted) : await onEdit(adapted);
    if (result !== 0) code = result;
  }
  return code;
}

try {
  const mode = parseInput('mode', z.enum(['snapshot', 'edit', 'bash-done']), process.argv[2]);
  const input = readStdin(mode, await text(process.stdin));
  process.exitCode =
    mode === 'bash-done' ? await onBashDone(input, true) : await checkPatch(mode, input);
} catch (error) {
  if (!(error instanceof HookError)) throw error;
  process.stderr.write(`${error.name}: ${error.message}\n`);
  process.exitCode = 2;
}
