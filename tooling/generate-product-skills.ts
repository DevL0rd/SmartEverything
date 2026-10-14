import { Context } from '@deepseek-ai/cordis';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const ROOT = fileURLToPath(new URL('../packages/harness/skills/', import.meta.url));
const SKILL = z.strictObject({
  name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  description: z.string().min(1).max(500),
  content: z.string().min(1),
  invocation: z.strictObject({ modelInvocable: z.literal(true), userInvocable: z.literal(true) }),
});

async function generate(): Promise<void> {
  const folders = (await readdir(ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const signal = AbortSignal.timeout(30_000);
  const provider = new FileSystemSkillProvider(
    new Context(),
    { signal, invalidate: (): void => undefined },
    { includeDefaultRoots: false, customSkillDirs: [ROOT], watch: false },
  );
  try {
    const observed = await provider.list({ signal });
    const candidates = 'candidates' in observed ? observed.candidates : observed;
    if (candidates.length !== folders.length)
      throw new Error('Every product skill folder must contain valid native SKILL.md metadata.');
    const skills = [];
    for (const candidate of candidates) {
      const definition = await provider.get(candidate, { signal });
      if (definition?.path === undefined || basename(dirname(definition.path)) !== definition.name)
        throw new Error('Product skill folder and native definition names must match.');
      skills.push(
        SKILL.parse({
          name: definition.name,
          description: definition.description,
          content: definition.content,
          invocation: definition.invocation,
        }),
      );
    }
    skills.sort((left, right) => left.name.localeCompare(right.name));
    await save(z.array(SKILL).min(1).max(32).parse(skills));
  } finally {
    await provider.dispose();
  }
}

async function save(skills: readonly z.infer<typeof SKILL>[]): Promise<void> {
  const revision = createHash('sha256').update(JSON.stringify(skills)).digest('hex');
  const staging = await mkdtemp(join(ROOT, '.catalogue-'));
  try {
    const path = join(staging, 'catalogue.json');
    await writeFile(path, `${JSON.stringify({ revision, skills }, null, 2)}\n`, { flag: 'wx' });
    await rename(path, join(ROOT, 'catalogue.json'));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

await generate();
