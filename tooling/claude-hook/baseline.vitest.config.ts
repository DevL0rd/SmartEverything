import { readFileSync } from 'node:fs';
import { env } from 'node:process';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { ROOT } from './process.ts';

const originalsPath = z.string().min(1).parse(env['CLAUDE_HOOK_ORIGINALS']);
const originals = z
  .record(z.string(), z.string().nullable())
  .parse(JSON.parse(readFileSync(originalsPath, 'utf8')));
const contents = new Map<string, string>(
  Object.entries(originals).flatMap(([rel, content]) =>
    content === null ? [] : [[`${ROOT}/${rel}`, content] as const],
  ),
);
const base = z
  .object({
    default: z.object({ test: z.object({ projects: z.array(z.record(z.string(), z.unknown())) }) }),
  })
  .parse(await import(pathToFileURL(`${ROOT}/vitest.config.ts`).href));

const restoreOriginals = {
  name: 'claude-hook-restore-originals',
  enforce: 'pre' as const,
  load(id: string): string | undefined {
    return contents.get(id.split('?')[0] ?? id);
  },
};

export default {
  root: ROOT,
  test: {
    projects: base.default.test.projects.map((project) => ({
      ...project,
      plugins: [restoreOriginals],
    })),
  },
};
