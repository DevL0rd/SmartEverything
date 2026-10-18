import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  desiredHarnessConfiguration,
  harnessTreeHash,
  readHarnessTree,
  writeHarnessTree,
} from '../src';
import { HARNESS_CLAUDE_PLUGINS_PACKAGE } from '../src/composition/claude-plugin-metadata';
import { HARNESS_SKILLS_PACKAGE } from '../src/composition/builtins';

let scratch: string | undefined;
afterEach(async () => {
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

async function folder(): Promise<string> {
  scratch = await mkdtemp(join(tmpdir(), 'extension-store-'));
  return scratch;
}

const SKILL_ASSET = { id: 'skill:note', version: 'v1', executes: false } as const;
const PLUGIN_ASSET = { id: 'plugin:tools', version: 'v2', executes: true } as const;

function assetsOf(
  configuration: ReturnType<typeof desiredHarnessConfiguration>,
  pkg: string,
): readonly string[] {
  const entry = configuration.entries.find((candidate) => candidate.package === pkg);
  return entry?.metadata?.skill_assets.map((asset) => asset.id) ?? [];
}

describe('the configuration derived from the Home Hub store', () => {
  it('has the same revision for the same choices', () => {
    const first = desiredHarnessConfiguration({ skills: [SKILL_ASSET] });
    const second = desiredHarnessConfiguration({ skills: [SKILL_ASSET] });

    expect(second.revision).toBe(first.revision);
  });

  it('gives skills to the skills entry and plugins to the plugins entry', () => {
    const configuration = desiredHarnessConfiguration({
      skills: [SKILL_ASSET],
      plugins: [PLUGIN_ASSET],
    });

    expect(assetsOf(configuration, HARNESS_SKILLS_PACKAGE)).toEqual(['skill:note']);
    expect(assetsOf(configuration, HARNESS_CLAUDE_PLUGINS_PACKAGE)).toEqual(['plugin:tools']);
  });

  it('changes revision when a skill changes version, a plugin is confirmed or a built-in is switched off', () => {
    const base = desiredHarnessConfiguration({ skills: [SKILL_ASSET], plugins: [PLUGIN_ASSET] });
    const variants = [
      desiredHarnessConfiguration({
        skills: [{ ...SKILL_ASSET, version: 'v9' }],
        plugins: [PLUGIN_ASSET],
      }),
      desiredHarnessConfiguration({
        skills: [SKILL_ASSET],
        plugins: [{ ...PLUGIN_ASSET, executes: false }],
      }),
      desiredHarnessConfiguration({
        skills: [SKILL_ASSET],
        plugins: [PLUGIN_ASSET],
        selections: { browser: { enabled: false, config: {} } },
      }),
    ];

    for (const variant of variants) expect(variant.revision).not.toBe(base.revision);
  });
});

describe('an installed skill or plugin folder', () => {
  it('has a version that depends on its files and their executable bit, not on their order', () => {
    const note = { path: 'SKILL.md', base64: Buffer.from('a').toString('base64') };
    const script = { path: 'run.sh', base64: Buffer.from('b').toString('base64') };
    const version = harnessTreeHash({ files: [note, script] });

    expect(harnessTreeHash({ files: [script, note] })).toBe(version);
    expect(harnessTreeHash({ files: [note, { ...script, executable: true }] })).not.toBe(version);
    expect(
      harnessTreeHash({
        files: [{ ...note, base64: Buffer.from('c').toString('base64') }, script],
      }),
    ).not.toBe(version);
  });

  it('survives a write and read keeping nested files and executables, and skips .git and links', async () => {
    const source = await folder();
    await mkdir(join(source, 'scripts'));
    await mkdir(join(source, '.git'));
    await writeFile(join(source, '.git', 'HEAD'), 'ref');
    await writeFile(join(source, 'SKILL.md'), '# Skill');
    await writeFile(join(source, 'scripts', 'run.sh'), 'echo hi', { mode: 0o755 });
    await symlink('/etc/hostname', join(source, 'outside'));

    const tree = await readHarnessTree(source);
    const target = join(source, 'copy');
    await mkdir(target);
    await writeHarnessTree(target, tree);

    expect(tree.files.map((file) => file.path).sort()).toEqual(['SKILL.md', 'scripts/run.sh']);
    expect(((await stat(join(target, 'scripts', 'run.sh'))).mode & 0o111) !== 0).toBe(true);
    expect(harnessTreeHash(await readHarnessTree(target))).toBe(harnessTreeHash(tree));
  });
});
