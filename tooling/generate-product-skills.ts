import { Context } from '@deepseek-ai/cordis';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { createHash } from 'node:crypto';
import { readdir, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const ROOT = resolve(
  process.argv[2] ?? fileURLToPath(new URL('../packages/harness/skills/', import.meta.url)),
);
const STAGING = join(dirname(ROOT), '.catalogue.json.tmp');
const SCHEMA_MODULE = new URL(
  '../packages/harness/src/composition/product-skill-schema.ts',
  import.meta.url,
);
const SCHEMAS = z.object({ PRODUCT_SKILL_LIST: z.instanceof(z.ZodType) });

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
    const { PRODUCT_SKILL_LIST } = SCHEMAS.parse(await import(SCHEMA_MODULE.href));
    const skills = [];
    for (const candidate of candidates) {
      const definition = await provider.get(candidate, { signal });
      if (definition?.path === undefined || basename(dirname(definition.path)) !== definition.name)
        throw new Error('Product skill folder and native definition names must match.');
      skills.push({
        name: definition.name,
        description: definition.description,
        content: definition.content,
        invocation: definition.invocation,
      });
    }
    skills.sort((left, right) => left.name.localeCompare(right.name));
    await save(PRODUCT_SKILL_LIST.parse(skills));
  } finally {
    await provider.dispose();
  }
}

async function save(skills: unknown): Promise<void> {
  const revision = createHash('sha256').update(JSON.stringify(skills)).digest('hex');
  await writeFile(STAGING, `${JSON.stringify({ revision, skills }, null, 2)}\n`);
  await rename(STAGING, join(ROOT, 'catalogue.json'));
}

await generate();
